# ustamnerde

Çalıştırma (Node.js 22.13 veya üstü gerekir):

    npm install
    npm start

Sonra tarayıcıda http://localhost:3000 aç. Telefondan denemek için aynı Wi-Fi'de bilgisayarın IP adresiyle aç (ör. http://192.168.1.20:3000).

- Üye ol ekranından "Usta arıyorum" veya "Ustayım" hesabı aç.
- Usta: Hesabım > profilini doldur. Müşteri: usta listesinden "Mesaj gönder".
- Veriler data.db dosyasında (SQLite) tutulur. Canlıya alırken SECRET ortam değişkeni ve HTTPS kullan.

## Giriş sistemi: Firebase Authentication

Üye ol, giriş, e-posta doğrulama, şifre sıfırlama ve Google ile giriş Firebase'e bağlıdır (proje: ustamnerede-1b25c).
Maili Firebase gönderir, senin SMTP/alan adı ayarına gerek yoktur.

Firebase panelinde (console.firebase.google.com) bir kez kontrol et:
- Authentication > Sign-in method: "E-posta/Şifre" ve "Google" açık olmalı.
- Authentication > Settings > Authorized domains: `localhost` ve (canlıya alınca) sitenin adresi listede olmalı.

Kendi bilgisayarında sadece `npm install` ve `npm start` yeterli, başka ayar gerekmez.
İnternetsiz/Firebase'siz eski sisteme dönmek için: `set LEGACY_AUTH=1` (sonra npm start).

## Yönetici paneli

1. Önce uygulamada (http://localhost:3000) yönetici e-postanla üye ol ve e-postanı doğrula (Firebase'in gönderdiği bağlantı).
2. cmd'de sunucuyu şöyle başlat:

       set ADMIN_EMAIL=senin@epostan.com
       npm start

3. http://localhost:3000/admin adresinde aynı e-posta ve şifreyle (ya da Google ile) giriş yap.

Panelde: istatistikler, kullanıcı arama/filtreleme, hesabı askıya alma/silme, konuşma inceleme ve mesaj silme,
CSV dışa aktarma, veritabanı yedeği ve yönetici işlem kaydı. Şifreler Firebase'dedir, panelde görünmez.
(Kullanıcı e-postalarını Firebase panelinden de görebilirsin: Authentication > Users.)
Programı her yeniden başlattığında ADMIN_EMAIL'i tekrar set etmen gerekir.

## Netlify ile yayınlama

Netlify yalnızca siteyi (`public` klasörü) barındırır. `server.js` (hesaplar, mesajlar, veritabanı) Netlify'da ÇALIŞMAZ,
onu kalıcı diski olan ayrı bir Node.js sunucusuna (Render, Railway, VPS vb.) koymalısın.

1. Sunucuyu bir Node.js hosting servisine yükle (Node 22.13+; başlatma komutu `npm start`, ortam değişkeni `ADMIN_EMAIL`).
   Veri `data.db` dosyasındadır; servisin kalıcı disk (persistent disk) özelliğini aç, yoksa yeniden başlayınca veriler silinir.
2. `netlify.toml` içindeki `BURAYA-SUNUCU-ADRESI` yerine sunucunun adresini yaz (örn. `ustamnerde-api.onrender.com`).
3. Netlify'a bu klasörü (ya da GitHub reposunu) bağla. Build komutu boş kalsın, yayın klasörü `public`.
4. Firebase panelinde Authentication > Settings > Authorized domains listesine Netlify adresini (örn. `siten.netlify.app`) ekle.
5. Netlify'daki `/api/...` istekleri otomatik olarak senin sunucuna yönlenir, ayrıca CORS ayarı gerekmez.
