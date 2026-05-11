# ⚡ Quick Start - Make Uploads Publicly Accessible

## 🎯 One Thing to Do

Edit `backend/.env` and add ONE line:

```
PUBLIC_API_URL=http://192.168.1.100:5000
```

Replace `192.168.1.100` with your machine's IP address.

**Find your IP:**

```bash
# Windows PowerShell
ipconfig | findstr "IPv4"

# Mac/Linux Terminal
ifconfig | grep "inet "
```

---

## ✅ That's It!

Now:

1. Restart the backend: `npm run dev`
2. Upload an image
3. Open the menu from ANY device on your network
4. Images will show ✅

---

## 🔧 Different Scenarios

| Use Case                             | Add This to .env                           |
| ------------------------------------ | ------------------------------------------ |
| **Local machine only**               | `PUBLIC_API_URL=http://localhost:5000`     |
| **Share with other devices on WiFi** | `PUBLIC_API_URL=http://192.168.1.100:5000` |
| **Production (domain)**              | `PUBLIC_API_URL=https://yourdomain.com`    |
| **Production (server IP)**           | `PUBLIC_API_URL=https://192.168.0.50`      |

---

## 🧪 Test It Works

Open in browser:

```
http://localhost:5000/api/upload/verify
```

You'll see:

- Current public URL being used ✅
- Test image/model paths
- Instructions if something's wrong

---

## ❓ Still Not Working?

Run the test script:

```bash
cd backend
node scripts/test-public-urls.js
```

This will:

1. Show what PUBLIC_API_URL is configured
2. Test if uploads folder is accessible
3. Give you specific instructions

---

## 📖 Need More Details?

See full guide: [PUBLIC_URL_SETUP.md](PUBLIC_URL_SETUP.md)

---

## 💡 Key Point

The magic happens with ONE environment variable: `PUBLIC_API_URL`

- **Before:** Images saved as `/uploads/images/file.jpg` (relative, not accessible from other devices)
- **After:** Images saved as `http://YOUR_IP:5000/uploads/images/file.jpg` (absolute, accessible everywhere)

That's all! 🚀
