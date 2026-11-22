AZƏRBAYCAN REKLAM BOTU — Render quraşdırılması

1) GitHub-da yeni repository yaradın və bu qovluqdakı faylları yükləyin.
2) Render-də New + -> PostgreSQL seçib verilən DATABASE_URL/Internal Database URL dəyərini götürün.
3) Render-də New + -> Web Service seçib GitHub repository-ni qoşun.
4) Build Command: npm install
   Start Command: npm start
5) Environment Variables əlavə edin:
   BOT_TOKEN = BotFather tokeni (məxfi saxlayın)
   ADMIN_ID = 7964569307
   CHANNEL_ID = @alqisatqielanazerbaycan
   DATABASE_URL = Render PostgreSQL Internal Database URL
   REFERRAL_REWARD = 5
6) Deploy edin. Saytın əsas ünvanında “Azərbaycan Reklam Botu aktivdir” görünməlidir.
7) Botu Telegram-da /start ilə yoxlayın.

VACİB QEYDLƏR:
- Bot kanalda admin olmalı və mesaj göndərmək icazəsi olmalıdır.
- Render Free Web Service yatdığı üçün bot fasilələrlə işləyə bilər; daimi 24/7 işləmə üçün həmişə aktiv xidmət planı lazımdır.
- PostgreSQL istifadə edin; müvəqqəti lokal fayl yaddaşı restart zamanı məlumat itirə bilər.
- Bu ilkin MVP-dir. Reklam sifarişlərinin qiymət/coin çıxılması, kanal abunəliyinin yoxlanması və daha geniş admin əmrləri növbəti mərhələdə əlavə edilə bilər.
