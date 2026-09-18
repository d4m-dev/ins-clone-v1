'use strict';

/**
 * controllers/post.controller.js
 * Feed, upload, single post, delete. Delete is allowed for the OWNER or an
 * ADMIN — the same rule enforced inside AdminJS.
 */

const path = require('path');
const { Op, QueryTypes } = require('sequelize');
const { Post, User, Like, Comment, sequelize } = require('../models');
const { env } = require('../config/env');
const urls = require('../config/urls');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const storage = require('../services/storage.service');
const telegram = require('../services/telegram.service');
const logger = require('../utils/logger');
const { readMp4DurationSeconds, roundSeconds, formatDuration } = require('../utils/mp4Duration');
const { assertFileSizes } = require('../middleware/upload.middleware');

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;

/** Eager-load shape shared by feed & single post queries. */
function buildInclude(viewerId) {
  return [
    {
      model: User,
      as: 'author',
      attributes: ['id', 'username', 'fullName', 'avatarUrl'],
    },
    viewerId
      ? { model: Like, as: 'likes', attributes: ['userId'], where: { userId: viewerId }, required: false }
      : { model: Like, as: 'likes', attributes: ['userId'], required: false },
  ];
}

/** GET /api/posts?page=1&limit=12&userId=3 */
const listPosts = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const userId = req.query.userId ? Number(req.query.userId) : null;

  const where = userId ? { userId } : {};

  const { rows, count } = await Post.findAndCountAll({
    where,
    include: buildInclude(req.user?.id),
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  res.json({
    success: true,
    data: {
      posts: rows.map((post) => post.toPublicJSON({ viewerId: req.user?.id, urls })),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(Math.ceil(count / limit), 1),
        hasMore: page * limit < count,
      },
    },
  });
});

/** GET /api/posts/:id */
const getPost = asyncHandler(async (req, res) => {
  const post = await Post.scope('withArchived').findByPk(req.params.id, {
    include: [
      ...buildInclude(req.user?.id),
      {
        model: Comment,
        as: 'comments',
        separate: true,
        limit: 50,
        order: [['createdAt', 'ASC']],
        include: [{ model: User, as: 'author', attributes: ['id', 'username', 'fullName', 'avatarUrl'] }],
      },
    ],
  });
  if (!post) throw ApiError.notFound('Post not found.');

  const payload = post.toPublicJSON({ viewerId: req.user?.id, urls });
  payload.comments = (post.comments || []).map((comment) =>
    comment.toPublicJSON({ viewerId: req.user?.id, urls })
  );

  res.json({ success: true, data: { post: payload } });
});

/**
 * Resolves a profile target from a route param that may be a numeric id or a
 * username. Keeps the URLs human friendly (/api/users/minh.nguyen/posts).
 */
async function resolveProfileUser(identifier) {
  const fields = ['id', 'username', 'fullName', 'avatarUrl', 'bio', 'createdAt'];
  const looksLikeId = /^\d+$/.test(String(identifier));
  const user = looksLikeId
    ? await User.findByPk(identifier, { attributes: fields })
    : await User.findOne({ where: { username: String(identifier).toLowerCase() }, attributes: fields });
  if (!user) throw ApiError.notFound('User not found.');
  return user;
}

/** GET /api/users/:identifier/posts — profile grid (id or username) */
const listUserPosts = asyncHandler(async (req, res) => {
  const user = await resolveProfileUser(req.params.identifier);

  const posts = await Post.findAll({
    where: { userId: user.id },
    include: buildInclude(req.user?.id),
    order: [['createdAt', 'DESC']],
    limit: 60,
  });

  res.json({
    success: true,
    data: {
      profile: user.toPublicJSON(),
      avatarUrl: urls.uploads.avatar(user.avatarUrl),
      posts: posts.map((post) => post.toPublicJSON({ viewerId: req.user?.id, urls })),
    },
  });
});

/** GET /api/users/me/posts — lưới ảnh của chính thành viên đang đăng nhập. */
const listMyPosts = asyncHandler(async (req, res) => {
  req.params.identifier = String(req.user.id);
  return listUserPosts(req, res);
});

/** Xoá mọi tệp multer đã ghi khi request thất bại giữa đường. */
async function discardUploadedFiles(files = {}) {
  const names = Object.values(files)
    .flat()
    .filter(Boolean)
    .map((file) => file.filename);
  await Promise.all(names.map((filename) => storage.deleteStoredFile(filename, 'posts')));
}

/**
 * POST /api/posts   (multipart/form-data)
 * Trường nhận được: `image` (ảnh, hoặc ẢNH BÌA cho video), `video` (Reels),
 * `audio` (nhạc nền), `caption`, `location`, `audioTitle`.
 *
 * `postMediaUploader.fields(...)` đã kiểm tra MIME + dung lượng và đặt tên
 * ngẫu nhiên cho tệp TRƯỚC khi handler này chạy.
 */
const createPost = asyncHandler(async (req, res) => {
  const files = req.files || {};
  const imageFile = files.image?.[0] || null;
  const videoFile = files.video?.[0] || null;
  const audioFile = files.audio?.[0] || null;

  if (!imageFile && !videoFile) {
    await discardUploadedFiles(files);
    throw ApiError.badRequest('Cần ít nhất một ảnh ("image") hoặc một video ("video").');
  }

  try {
    // Kiểm tra lại dung lượng thật của từng tệp (multer dùng limit chung).
    assertFileSizes(files);

    const mediaType = videoFile ? 'video' : 'photo';

    /* ------------------- thời lượng video (không cần ffmpeg) ------------------ */
    let durationSeconds = null;
    if (videoFile) {
      const detected = await readMp4DurationSeconds(videoFile.path);
      const clientReported = Number.parseFloat(req.body.durationSeconds);
      durationSeconds = roundSeconds(
        detected ?? (Number.isFinite(clientReported) ? clientReported : null)
      );

      const limit = env.uploads.maxVideoDurationSeconds;
      if (durationSeconds !== null && durationSeconds > limit + 0.5) {
        // +0.5s dung sai: client và container có thể lệch vài khung hình.
        throw ApiError.validation(
          `Video dài ${formatDuration(durationSeconds)} — vượt giới hạn ${limit} giây của Reels.`
        );
      }
    }

    const post = await Post.create({
      userId: req.user.id,
      mediaType,
      imageFilename: imageFile?.filename ?? null,
      mimeType: imageFile?.mimetype ?? videoFile?.mimetype ?? 'image/jpeg',
      sizeBytes: imageFile?.size ?? null,
      videoFilename: videoFile?.filename ?? null,
      videoMimeType: videoFile?.mimetype ?? null,
      videoSizeBytes: videoFile?.size ?? null,
      durationSeconds,
      audioFilename: audioFile?.filename ?? null,
      audioTitle: req.body.audioTitle || null,
      caption: req.body.caption,
      location: req.body.location,
    });

    await post.reload({
      include: [{ model: User, as: 'author', attributes: ['id', 'username', 'fullName', 'avatarUrl', 'locale'] }],
    });

    logger.info(
      `Bài mới #${post.id} bởi @${req.user.username} — ${mediaType}` +
        (durationSeconds ? ` ${formatDuration(durationSeconds)}` : '') +
        ` (${((videoFile?.size ?? imageFile?.size ?? 0) / 1024).toFixed(0)} KB)` +
        (audioFile ? ' + nhạc nền' : '')
    );

    // Không chặn phản hồi HTTP vì Telegram.
    const absolutePath = videoFile
      ? storage.resolveStoredFile(videoFile.filename, 'posts')
      : storage.resolveStoredFile(imageFile.filename, 'posts');
    telegram
      .notifyNewPhoto(post, req.user, absolutePath)
      .catch((error) => logger.warn(`Telegram notify failed: ${error.message}`));

    res.status(201).json({
      success: true,
      data: { post: post.toPublicJSON({ viewerId: req.user.id, urls }) },
    });
  } catch (error) {
    // Ràng buộc dữ liệu hoặc quá thời lượng → dọn tệp đã ghi để không rác ổ đĩa.
    await discardUploadedFiles(files);
    throw error;
  }
});

/** GET /api/reels?page=&limit= — dòng video dọc (Reels). */
const listReels = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 6, 20);

  const { rows, count } = await Post.scope('reels').findAndCountAll({
    include: buildInclude(req.user?.id),
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  res.json({
    success: true,
    data: {
      reels: rows.map((post) => post.toPublicJSON({ viewerId: req.user?.id, urls })),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(Math.ceil(count / limit), 1),
        hasMore: page * limit < count,
      },
      maxDurationSeconds: env.uploads.maxVideoDurationSeconds,
    },
  });
});

/**
 * GET /api/stories — "Khoảnh khắc 24 giờ": ảnh/video đăng trong 24h qua,
 * gom theo từng thành viên (giống vòng tròn story ở đầu Instagram).
 */
const listStories = asyncHandler(async (req, res) => {
  const windowHours = 24;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const posts = await Post.findAll({
    where: { createdAt: { [Op.gte]: since } },
    include: buildInclude(req.user?.id),
    order: [['createdAt', 'DESC']],
    limit: 120,
  });

  // Gom theo tác giả, giữ thứ tự: người đăng gần nhất đứng đầu.
  const groups = new Map();
  for (const post of posts) {
    const key = String(post.userId);
    if (!groups.has(key)) {
      groups.set(key, {
        author: post.author
          ? {
              id: Number(post.author.id),
              username: post.author.username,
              fullName: post.author.fullName,
              avatarUrl: urls.uploads.absolute(post.author.avatarUrl),
            }
          : null,
        latestAt: post.createdAt,
        posts: [],
      });
    }
    groups.get(key).posts.push(post.toPublicJSON({ viewerId: req.user?.id, urls }));
  }

  const items = [...groups.values()].sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));

  res.json({
    success: true,
    data: {
      windowHours,
      total: posts.length,
      groups: items,
      expiresAt: new Date(since.getTime() + windowHours * 60 * 60 * 1000).toISOString(),
    },
  });
});

/** POST /api/posts/:id/views — đếm lượt xem (cho Reels và ảnh). */
const incrementViews = asyncHandler(async (req, res) => {
  const post = await Post.scope('withArchived').findByPk(req.params.id, {
    attributes: ['id', 'viewCount'],
  });
  if (!post) throw ApiError.notFound('Post not found.');

  await Post.scope('withArchived').increment('viewCount', {
    by: 1,
    where: { id: post.id },
    silent: true,
  });

  res.json({ success: true, data: { postId: Number(post.id), viewCount: Number(post.viewCount) + 1 } });
});

/**
 * GET /api/posts/:id/download — tải tệp gốc về máy (tên tệp thân thiện).
 * Ảnh → tải ảnh; video → tải video. Dùng stream nên không tốn RAM điện thoại.
 */
const downloadPost = asyncHandler(async (req, res) => {
  const post = await Post.scope('withArchived').findByPk(req.params.id, {
    include: [{ model: User, as: 'author', attributes: ['id', 'username'] }],
  });
  if (!post) throw ApiError.notFound('Post not found.');

  const isVideo = post.mediaType === 'video';
  const filename = isVideo ? post.videoFilename : post.imageFilename;
  const absolutePath = storage.resolveStoredFile(filename, 'posts');
  if (!absolutePath) throw ApiError.notFound('Tệp không còn trên máy chủ.');

  const extension = path.extname(filename);
  const safeOwner = String(post.author?.username || 'family').replace(/[^a-z0-9._-]/gi, '');
  const stamp = new Date(post.createdAt).toISOString().slice(0, 10);
  const downloadName = `familygram-${safeOwner}-${post.id}-${stamp}${extension}`;

  logger.info(`Tải về #${post.id} (${isVideo ? 'video' : 'ảnh'}) bởi ${req.ip}`);
  res.download(absolutePath, downloadName, (error) => {
    if (error && !res.headersSent) {
      next(ApiError.notFound('Không thể tải tệp này.'));
    }
  });
});

/** DELETE /api/posts/:id — owner or admin. Removes DB row + file on disk. */
const deletePost = asyncHandler(async (req, res) => {
  const post = await Post.scope('withArchived').findByPk(req.params.id);
  if (!post) throw ApiError.notFound('Post not found.');

  const isOwner = Number(post.userId) === Number(req.user.id);
  if (!isOwner && !req.user.isAdmin()) {
    throw ApiError.forbidden('You can only delete your own photos.');
  }

  // Xoá bản ghi trước (CASCADE dọn lượt thích + bình luận), rồi xoá tệp trên đĩa:
  // ảnh/ảnh bìa, video của Reels và cả tệp nhạc nền nếu có.
  const filesToDelete = [post.imageFilename, post.videoFilename, post.audioFilename].filter(Boolean);
  await post.destroy();
  await Promise.all(filesToDelete.map((filename) => storage.deleteStoredFile(filename, 'posts')));

  res.json({ success: true, data: { deletedId: Number(req.params.id), removedFiles: filesToDelete.length } });
});

/** POST /api/posts/:id/likes — toggle like, returns the fresh counters. */
const toggleLike = asyncHandler(async (req, res) => {
  const post = await Post.scope('withArchived').findByPk(req.params.id, { attributes: ['id', 'userId'] });
  if (!post) throw ApiError.notFound('Post not found.');

  const existing = await Like.findOne({ where: { postId: post.id, userId: req.user.id } });

  if (existing) {
    await existing.destroy();
  } else {
    try {
      await Like.create({ postId: post.id, userId: req.user.id });
    } catch (error) {
      // Unique index hit → the like already exists (double tap / retry).
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    }
  }

  const fresh = await Post.scope('withArchived').findByPk(post.id, { attributes: ['id', 'likeCount', 'commentCount'] });

  res.json({
    success: true,
    data: {
      postId: Number(post.id),
      liked: !existing,
      likeCount: Number(fresh.likeCount),
      commentCount: Number(fresh.commentCount),
    },
  });
});

/** GET /api/posts/stats — small dashboard badge for the frontend header. */
const getStats = asyncHandler(async (_req, res) => {
  const [users, posts, likes, comments, photos] = await Promise.all([
    User.count(),
    Post.count(),
    Like.count(),
    Comment.count(),
    sequelize.query('SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM posts', {
      type: QueryTypes.SELECT,
    }),
  ]);

  res.json({
    success: true,
    data: {
      users,
      posts,
      likes,
      comments,
      storage: {
        bytes: Number(photos[0]?.bytes || 0),
        megabytes: Number((Number(photos[0]?.bytes || 0) / 1024 / 1024).toFixed(2)),
      },
    },
  });
});

module.exports = {
  listPosts,
  getPost,
  listUserPosts,
  listMyPosts,
  resolveProfileUser,
  createPost,
  deletePost,
  toggleLike,
  getStats,
  /* Reels · Stories · lượt xem · tải về */
  listReels,
  listStories,
  incrementViews,
  downloadPost,
  buildInclude,
  DISCARD: discardUploadedFiles,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  Op,
};
