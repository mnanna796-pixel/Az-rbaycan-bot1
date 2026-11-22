require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const { BOT_TOKEN, ADMIN_ID, CHANNEL_ID, DATABASE_URL } = process.env;
const REWARD = Number(process.env.REFERRAL_REWARD || 5);
const PORT = Number(process.env.PORT || 3000);
if (!BOT_TOKEN || !ADMIN_ID || !CHANNEL_ID || !DATABASE_URL) {
  console.error('BOT_TOKEN, ADMIN_ID, CHANNEL_ID və DATABASE_URL mütləqdir.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.get('/', (_req, res) => res.status(200).send('Azərbaycan Reklam Botu aktivdir ✅'));
app.listen(PORT, () => console.log(`Health server ${PORT} portunda işləyir`));

const isAdmin = (ctx) => String(ctx.from?.id) === String(ADMIN_ID);
const mainMenu = (admin = false) => Markup.keyboard([
  ['📢 Reklam yerləşdir', '💰 Balansım'],
  ['👥 Referal linkim', '🎁 Gündəlik bonus'],
  ['📊 Statistika', 'ℹ️ Qaydalar'],
  ...(admin ? [['👑 Admin paneli']] : [])
]).resize();

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY, username TEXT, first_name TEXT, balance INTEGER NOT NULL DEFAULT 0,
    referred_by BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_bonus TIMESTAMPTZ
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ads (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ
  )`);
}
async function ensureUser(from, referrerId) {
  const existing = await pool.query('SELECT id FROM users WHERE id=$1', [String(from.id)]);
  if (existing.rowCount) {
    await pool.query('UPDATE users SET username=$2, first_name=$3 WHERE id=$1', [String(from.id), from.username || null, from.first_name || '']);
    return false;
  }
  let validRef = null;
  if (referrerId && String(referrerId) !== String(from.id)) {
    const ref = await pool.query('SELECT id FROM users WHERE id=$1', [String(referrerId)]);
    if (ref.rowCount) validRef = String(referrerId);
  }
  await pool.query('INSERT INTO users(id,username,first_name,referred_by) VALUES($1,$2,$3,$4)', [String(from.id), from.username || null, from.first_name || '', validRef]);
  if (validRef) {
    await pool.query('UPDATE users SET balance=balance+$2 WHERE id=$1', [validRef, REWARD]);
    try { await bot.telegram.sendMessage(validRef, `🎉 Yeni referal qazandın! Balansına +${REWARD} coin əlavə edildi.`); } catch (_) {}
  }
  return true;
}
async function showHome(ctx) {
  await ctx.reply(`Salam, ${ctx.from.first_name || 'istifadəçi'}! 🇦🇿\nAzərbaycan Reklam Botuna xoş gəlmisən.`, mainMenu(isAdmin(ctx)));
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload;
  await ensureUser(ctx.from, /^\d+$/.test(payload || '') ? payload : null);
  await showHome(ctx);
});
bot.hears('💰 Balansım', async (ctx) => {
  await ensureUser(ctx.from);
  const r = await pool.query('SELECT balance FROM users WHERE id=$1', [String(ctx.from.id)]);
  await ctx.reply(`💰 Balansın: ${r.rows[0].balance} coin`, mainMenu(isAdmin(ctx)));
});
bot.hears('👥 Referal linkim', async (ctx) => {
  await ensureUser(ctx.from);
  const me = await bot.telegram.getMe();
  const link = `https://t.me/${me.username}?start=${ctx.from.id}`;
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE referred_by=$1', [String(ctx.from.id)]);
  await ctx.reply(`👥 Referal linkin:\n${link}\n\n👤 Dəvət etdiklərin: ${r.rows[0].n}\n🎁 Hər yeni istifadəçiyə görə: +${REWARD} coin\n\nQeyd: yalnız botu ilk dəfə açan real yeni istifadəçi sayılır.`, mainMenu(isAdmin(ctx)));
});
bot.hears('🎁 Gündəlik bonus', async (ctx) => {
  await ensureUser(ctx.from);
  const r = await pool.query(`UPDATE users SET balance=balance+2,last_bonus=NOW()
    WHERE id=$1 AND (last_bonus IS NULL OR last_bonus < NOW()-INTERVAL '24 hours') RETURNING balance`, [String(ctx.from.id)]);
  if (!r.rowCount) return ctx.reply('⏳ Gündəlik bonusunu artıq götürmüsən. 24 saat sonra yenidən yoxla.', mainMenu(isAdmin(ctx)));
  await ctx.reply(`🎁 +2 coin qazandın! Yeni balansın: ${r.rows[0].balance} coin.`, mainMenu(isAdmin(ctx)));
});
bot.hears('📢 Reklam yerləşdir', async (ctx) => {
  await ensureUser(ctx.from);
  waitingAds.add(ctx.from.id);
  await ctx.reply('📢 Reklam mətnini və ya kanal/qrup linkini bir mesajda göndər. Reklam admin təsdiqindən sonra kanalda paylaşılacaq.');
});
bot.hears('📊 Statistika', async (ctx) => {
  const [u, a] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM users'),
    pool.query("SELECT COUNT(*)::int AS n FROM ads WHERE status='approved'")
  ]);
  await ctx.reply(`📊 Bot statistikası\n👥 İstifadəçilər: ${u.rows[0].n}\n📢 Paylaşılan reklamlar: ${a.rows[0].n}`, mainMenu(isAdmin(ctx)));
});
bot.hears('ℹ️ Qaydalar', (ctx) => ctx.reply('ℹ️ Qaydalar:\n• Saxta və qanunsuz reklam qəbul edilmir.\n• Reklamlar admin yoxlamasından keçir.\n• Spam və aldadıcı linklər qadağandır.', mainMenu(isAdmin(ctx))));
bot.hears('👑 Admin paneli', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const r = await pool.query("SELECT id,user_id,content FROM ads WHERE status='pending' ORDER BY id ASC LIMIT 10");
  if (!r.rowCount) return ctx.reply('Gözləyən reklam yoxdur.', mainMenu(true));
  for (const ad of r.rows) {
    await ctx.reply(`📥 Reklam #${ad.id}\nİstifadəçi: ${ad.user_id}\n\n${ad.content}`, Markup.inlineKeyboard([
      [Markup.button.callback('✅ Təsdiqlə və paylaş', `approve:${ad.id}`), Markup.button.callback('❌ Rədd et', `reject:${ad.id}`)]
    ]));
  }
});
bot.action(/^approve:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('İcazə yoxdur');
  const id = Number(ctx.match[1]);
  const r = await pool.query("UPDATE ads SET status='approved',reviewed_at=NOW() WHERE id=$1 AND status='pending' RETURNING content", [id]);
  if (!r.rowCount) return ctx.answerCbQuery('Bu reklam artıq yoxlanılıb.');
  try {
    await bot.telegram.sendMessage(CHANNEL_ID, `📢 YENİ REKLAM\n\n${r.rows[0].content}\n\n━━━━━━━━━━━━\n🇦🇿 Azərbaycan Alqı-Satqı Elanları`);
    await pool.query('UPDATE users SET balance=balance+0 WHERE id=(SELECT user_id FROM ads WHERE id=$1)', [id]);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.answerCbQuery('Reklam kanalda paylaşıldı.');
    const owner = await pool.query('SELECT user_id FROM ads WHERE id=$1', [id]);
    await bot.telegram.sendMessage(owner.rows[0].user_id, '✅ Reklamın təsdiqləndi və kanalda paylaşıldı.');
  } catch (e) {
    await pool.query("UPDATE ads SET status='pending',reviewed_at=NULL WHERE id=$1", [id]);
    await ctx.answerCbQuery('Paylaşmaq mümkün olmadı. Botun kanal adminliyini yoxla.', { show_alert: true });
  }
});
bot.action(/^reject:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('İcazə yoxdur');
  const id = Number(ctx.match[1]);
  const r = await pool.query("UPDATE ads SET status='rejected',reviewed_at=NOW() WHERE id=$1 AND status='pending' RETURNING user_id", [id]);
  if (r.rowCount) await bot.telegram.sendMessage(r.rows[0].user_id, '❌ Reklamın admin tərəfindən rədd edildi.');
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.answerCbQuery('Reklam rədd edildi.');
});
// Reklam mətni gözləyən istifadəçilər üçün sadə yaddaş. Restart zamanı yarımçıq müraciət sıfırlanır.
const waitingAds = new Set();
bot.on('text', async (ctx) => {
  if (['📢 Reklam yerləşdir','💰 Balansım','👥 Referal linkim','🎁 Gündəlik bonus','📊 Statistika','ℹ️ Qaydalar','👑 Admin paneli'].includes(ctx.message.text)) return;
  if (!waitingAds.has(ctx.from.id)) return;
  waitingAds.delete(ctx.from.id);
  const content = ctx.message.text.trim();
  if (content.length < 5 || content.length > 3000) return ctx.reply('Reklam mətni 5–3000 simvol arası olmalıdır. Yenidən 📢 Reklam yerləşdir düyməsini seç.');
  const r = await pool.query('INSERT INTO ads(user_id,content) VALUES($1,$2) RETURNING id', [String(ctx.from.id), content]);
  await ctx.reply(`✅ Reklam müraciətin qəbul edildi.\n🆔 Müraciət: #${r.rows[0].id}\n⏳ Admin yoxlamasını gözlə.`, mainMenu(isAdmin(ctx)));
  try { await bot.telegram.sendMessage(ADMIN_ID, `📥 Yeni reklam müraciəti #${r.rows[0].id}\nİstifadəçi: ${ctx.from.id}\n\n${content}`, Markup.inlineKeyboard([[Markup.button.callback('👑 Admin panelində aç', 'open_admin')]])); } catch (_) {}
});
bot.action('open_admin', async (ctx) => { if (!isAdmin(ctx)) return ctx.answerCbQuery('İcazə yoxdur'); await ctx.answerCbQuery(); await ctx.reply('Admin paneli:', mainMenu(true)); });

(async () => {
  await initDb();
  await bot.launch();
  console.log('Azərbaycan Reklam Botu işə düşdü');
})();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
