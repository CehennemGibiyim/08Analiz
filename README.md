# 08 Analiz

Çoklu borsa ve zaman diliminde teknik analiz, sinyal ve sanal işlem takip uygulaması.

## GitHub Pages + Supabase Free

Uygulama artık Render veya ayrı bir Node.js sunucusu gerektirmez.

- Frontend: GitHub Pages üzerinde statik olarak yayınlanır.
- Kimlik doğrulama: Supabase Auth.
- Kullanıcı rolleri ve erişim durumu: Supabase `profiles` tablosu.
- Veriler: Kullanıcının tarayıcısındaki IndexedDB; giriş sistemi Supabase oturumuyla korunur.
- Ücretsiz mimari: GitHub Pages + Supabase Free.

## Supabase kurulumu

1. Supabase projesini oluşturun.
2. `supabase-setup.sql` dosyasının tamamını Supabase Dashboard → **SQL Editor** bölümünde bir kez çalıştırın.
3. Supabase Dashboard → **Authentication → Providers → Email** bölümünden test kurulumu için **Confirm email** seçeneğini kapatın. Açık bırakırsanız yeni kullanıcılar e-posta onayı yapmadan giriş yapamaz.
4. Dashboard → **Authentication → Users → Add user** bölümünden ilk hesabı oluşturun. E-posta adresini ve güçlü şifreyi belirleyin; kullanıcıyı onaylayın.
5. SQL Editor'da ilk hesabı admin yapın. E-postenin `@` işaretinden önceki kısmını kullanın:

```sql
update public.profiles
set role = 'admin'
where username = 'admin';
```

6. `api-config.js` içindeki `SUPABASE_URL` ve `SUPABASE_PUBLISHABLE_KEY` değerlerini kendi projenizle eşleştirin.
7. Güncel dosyaları GitHub repository'sine gönderin ve GitHub Pages workflow'unun tamamlanmasını bekleyin.

Dashboard'dan oluşturduğunuz ilk kullanıcıyla giriş yaparken tam e-posta adresini yazın. Uygulama içinden oluşturulan kullanıcılar için e-posta yerine yalnızca kullanıcı adı yazmak yeterlidir; uygulama bunları `users.08analiz.local` alanında eşler.

## Admin paneli

Admin kullanıcı giriş yaptıktan sonra **Üyeleri yönet** panelinden:

- yeni misafir veya admin hesabı oluşturabilir,
- aktif kullanıcıların rolünü değiştirebilir,
- bir kullanıcının uygulama erişimini kaldırabilir.

Erişimi kaldırılan profil silinmez; `is_active` alanı kapatılır ve kullanıcı tekrar giriş yapamaz. Supabase Auth kullanıcı kaydı gerektiğinde Dashboard → Authentication → Users bölümünden ayrıca silinebilir.

## Güvenlik

- `sb_publishable_...` veya `anon` anahtarı frontend'de kullanılabilir; bu anahtar public istemci anahtarıdır.
- `service_role`, database password veya secret key'i asla GitHub'a koymayın ve paylaşmayın.
- Supabase RLS politikalarını kurmak için `supabase-setup.sql` dosyasını eksiksiz çalıştırın.
- Kullanıcı işlemleri ve rol değişiklikleri Supabase Auth + RLS ile doğrulanır.
- Piyasa analizleri yatırım tavsiyesi değildir; sinyalleri kendi risk limitlerinizle doğrulayın.

## GitHub Pages

Repository ayarlarında **Settings → Pages → Source: GitHub Actions** seçili olmalıdır. `.github/workflows/deploy-pages.yml` dosyası kökteki statik uygulamayı yayınlar.
