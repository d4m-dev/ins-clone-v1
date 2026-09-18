'use strict';

/**
 * models/Post.js — một mục trong album: ẢNH hoặc VIDEO (Reels).
 *
 * Quy ước lưu trữ:
 *   • Database CHỈ lưu tên tệp (không bao giờ lưu URL) → đổi domain Cloudflare
 *     là việc của config/urls.js, không cần migrate dữ liệu.
 *   • mediaType = 'photo' → dùng imageFilename.
 *   • mediaType = 'video' → dùng videoFilename, kèm imageFilename làm ảnh bìa
 *     (poster) do trình duyệt cắt ra từ khung hình đầu — vì server KHÔNG có
 *     ffmpeg để trích frame.
 *   • audioFilename: nhạc nền tuỳ chọn. Không mux vào video (không cần ffmpeg):
 *     trình duyệt phát <video muted> + <audio> song song và đồng bộ thời gian.
 */

const { DataTypes } = require('sequelize');

/** Giới hạn thời lượng Reels — đồng bộ với MAX_VIDEO_DURATION_SECONDS trong .env */
const REEL_MAX_SECONDS = Number(process.env.MAX_VIDEO_DURATION_SECONDS || 60);

module.exports = (sequelize) => {
  const Post = sequelize.define(
    'Post',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },

      /* ------------------------------ media ------------------------------ */
      mediaType: {
        type: DataTypes.ENUM('photo', 'video'),
        allowNull: false,
        defaultValue: 'photo',
        comment: 'photo = ảnh tĩnh · video = Reels (tối đa ' + REEL_MAX_SECONDS + 's)',
      },
      imageFilename: {
        type: DataTypes.STRING(160),
        allowNull: true,
        comment: 'Ảnh, hoặc ảnh bìa (poster) của video — tên tệp trong uploads/posts/',
      },
      videoFilename: {
        type: DataTypes.STRING(160),
        allowNull: true,
        comment: 'Chỉ có khi mediaType = video (mp4/webm/mov)',
      },
      videoMimeType: {
        type: DataTypes.STRING(60),
        allowNull: true,
      },
      videoSizeBytes: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      durationSeconds: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Server đọc từ atom mvhd (utils/mp4Duration) — không cần ffprobe',
      },
      audioFilename: {
        type: DataTypes.STRING(160),
        allowNull: true,
        comment: 'Nhạc nền tuỳ chọn, phát đồng bộ ở client',
      },
      audioTitle: {
        type: DataTypes.STRING(120),
        allowNull: true,
        comment: 'Tên bài hát / nguồn nhạc để ghi công',
      },

      mimeType: {
        type: DataTypes.STRING(60),
        allowNull: false,
        defaultValue: 'image/jpeg',
      },
      sizeBytes: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      caption: {
        type: DataTypes.STRING(500),
        allowNull: true,
        validate: { len: { args: [0, 500], msg: 'Chú thích tối đa 500 ký tự.' } },
        set(value) {
          const trimmed = String(value ?? '').trim();
          this.setDataValue('caption', trimmed.length ? trimmed : null);
        },
      },
      location: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },

      /* ----------------------------- counters ---------------------------- */
      likeCount: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      commentCount: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      viewCount: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: 'Số lượt xem (Reels + ảnh) — dùng cho bảng xếp hạng sau này',
      },

      isArchived: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Quản trị viên có thể ẩn khỏi album mà không xoá tệp',
      },
    },
    {
      tableName: 'posts',
      indexes: [
        { fields: ['user_id'] },
        { fields: ['created_at'] },
        { fields: ['media_type'] },
      ],
      defaultScope: { where: { isArchived: false } },
      scopes: {
        withArchived: {},
        /** Dùng cho trang Reels: chỉ video, mới nhất trước. */
        reels: { where: { mediaType: 'video', isArchived: false } },
      },
      validate: {
        /** Một bài đăng phải có ít nhất một tệp media. */
        hasMedia() {
          if (!this.imageFilename && !this.videoFilename) {
            throw new Error('Bài đăng phải có ảnh hoặc video.');
          }
        },
        /** Video không được vượt quá giới hạn thời lượng. */
        durationWithinLimit() {
          if (
            this.mediaType === 'video' &&
            Number.isFinite(this.durationSeconds) &&
            this.durationSeconds > REEL_MAX_SECONDS
          ) {
            throw new Error(`Video không được dài quá ${REEL_MAX_SECONDS} giây.`);
          }
        },
      },
    }
  );

  /** true/false tiện cho view & API. */
  Post.prototype.isVideo = function isVideo() {
    return this.mediaType === 'video';
  };

  /**
   * Thời lượng dạng "0:42" để hiển thị trên UI.
   * @param {(seconds: number) => string} [formatter]
   */
  Post.prototype.durationLabel = function durationLabel(formatter) {
    if (!Number.isFinite(this.durationSeconds)) return null;
    if (typeof formatter === 'function') return formatter(this.durationSeconds);
    const total = Math.max(0, Math.round(this.durationSeconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  /**
   * Chuẩn hoá cho API. `author` phải được eager-load; `urls` là config/urls.js.
   * `viewerId` cho biết người xem đã thích bài này chưa và có được xoá không.
   */
  Post.prototype.toPublicJSON = function toPublicJSON({ viewerId = null, urls } = {}) {
    const author = this.author || this.User || null;
    const likedByViewer = Array.isArray(this.Likes)
      ? this.Likes.some((like) => Number(like.userId) === Number(viewerId))
      : Boolean(this.get?.('likedByViewer'));

    return {
      id: Number(this.id),
      mediaType: this.mediaType,
      isVideo: this.mediaType === 'video',

      // Ảnh (hoặc poster của video) — nằm trong uploads/posts/
      imageUrl: urls.uploads.post(this.imageFilename),
      imagePath: urls.uploads.relativePost(this.imageFilename),

      // Video + nhạc nền (null với ảnh thường)
      videoUrl: this.videoFilename ? urls.uploads.post(this.videoFilename) : null,
      videoPath: this.videoFilename ? urls.uploads.relativePost(this.videoFilename) : null,
      videoMimeType: this.videoMimeType,
      durationSeconds: this.durationSeconds ?? null,
      durationLabel: this.durationLabel(),
      audioUrl: this.audioFilename ? urls.uploads.post(this.audioFilename) : null,
      audioTitle: this.audioTitle,

      caption: this.caption,
      location: this.location,
      likeCount: Number(this.likeCount),
      commentCount: Number(this.commentCount),
      viewCount: Number(this.viewCount),
      likedByViewer,
      canDelete:
        viewerId != null &&
        (Number(this.userId) === Number(viewerId) || Boolean(this.viewerIsAdmin)),
      downloadUrl: urls.api.posts.download(this.id),
      createdAt: this.createdAt,
      author: author
        ? {
            id: Number(author.id),
            username: author.username,
            fullName: author.fullName,
            avatarUrl: urls.uploads.avatar(author.avatarUrl),
          }
        : null,
    };
  };

  Post.REEL_MAX_SECONDS = REEL_MAX_SECONDS;
  Post.REEL_MAX_SECONDS_REF = REEL_MAX_SECONDS;

  return Post;
};
