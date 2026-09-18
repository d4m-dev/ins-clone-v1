'use strict';

/**
 * models/index.js
 * ---------------------------------------------------------------------------
 * Registers every model, wires the associations (with the CASCADE rules that
 * make "delete a user" safe) and keeps the denormalised counters in sync.
 * ---------------------------------------------------------------------------
 */

const { sequelize, Sequelize, Sequelize: { QueryTypes } } = require('../config/database');

// --- model factories -------------------------------------------------------
const User = require('./User')(sequelize);
const Post = require('./Post')(sequelize);
const Comment = require('./Comment')(sequelize);
const Like = require('./Like')(sequelize);

// --- associations ----------------------------------------------------------
User.hasMany(Post, { foreignKey: 'userId', as: 'posts', onDelete: 'CASCADE', hooks: true });
Post.belongsTo(User, { foreignKey: 'userId', as: 'author' });

Post.hasMany(Comment, { foreignKey: 'postId', as: 'comments', onDelete: 'CASCADE', hooks: true });
Comment.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
User.hasMany(Comment, { foreignKey: 'userId', as: 'comments', onDelete: 'CASCADE', hooks: true });
Comment.belongsTo(User, { foreignKey: 'userId', as: 'author' });

Post.hasMany(Like, { foreignKey: 'postId', as: 'likes', onDelete: 'CASCADE', hooks: true });
Like.belongsTo(Post, { foreignKey: 'postId', as: 'post' });
User.hasMany(Like, { foreignKey: 'userId', as: 'likes', onDelete: 'CASCADE', hooks: true });
Like.belongsTo(User, { foreignKey: 'userId', as: 'author' });

// --- counter maintenance ---------------------------------------------------
// Counters are updated with atomic SQL so parallel likes can never drift.
// Only `transaction` is forwarded from the hook options — spreading the whole
// options object would leak keys (`where`, `hooks`, …) into sequelize.query().
async function refreshCounters(postId, transaction = null) {
  const [likeRow] = await sequelize.query(
    'SELECT COUNT(*) AS total FROM likes WHERE post_id = :postId',
    { replacements: { postId }, type: QueryTypes.SELECT, transaction }
  );
  const [commentRow] = await sequelize.query(
    'SELECT COUNT(*) AS total FROM comments WHERE post_id = :postId',
    { replacements: { postId }, type: QueryTypes.SELECT, transaction }
  );

  await Post.scope('withArchived').update(
    { likeCount: Number(likeRow?.total || 0), commentCount: Number(commentRow?.total || 0) },
    { where: { id: postId }, hooks: false, transaction, silent: true }
  );
}

Like.afterCreate((like, options) => refreshCounters(like.postId, options?.transaction));
Like.afterDestroy((like, options) => refreshCounters(like.postId, options?.transaction));
Comment.afterCreate((comment, options) => refreshCounters(comment.postId, options?.transaction));
Comment.afterDestroy((comment, options) => refreshCounters(comment.postId, options?.transaction));

module.exports = {
  sequelize,
  Sequelize,
  User,
  Post,
  Comment,
  Like,
  refreshCounters,
};
