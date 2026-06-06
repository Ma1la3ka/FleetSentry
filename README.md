# TrackSafe

A comprehensive tracking dashboard application with admin and worker dashboards.

## 📁 Project Structure

```
TrackSafe/
├── index.html              # Landing page
├── style.css               # Landing page styles
├── login/                  # Login page
│   └── index.html
├── register/               # Registration page
│   ├── index.html
│   ├── script.js
│   └── style.css
├── dashboard-admin/        # Admin dashboard
│   ├── index.html
│   ├── script.js
│   └── style.css
├── worker-dashboard/       # Worker dashboard
│   ├── index.html
│   ├── script.js
│   └── style.css
├── package.json            # Project metadata
├── vercel.json             # Vercel configuration
├── README.md               # This file
└── .gitignore              # Git ignore rules
```

## 🚀 Deployment on Vercel

1. **Initialize Git** (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Push to GitHub**:
   - Create a repository on GitHub
   - Push your code:
     ```bash
     git remote add origin https://github.com/your-username/tracksafe.git
     git push -u origin main
     ```

3. **Deploy on Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select your GitHub repository
   - Click "Deploy"

## 📄 Pages

- **Landing Page** (`/index.html`) - Main entry point
- **Login** (`/login/index.html`) - User login
- **Register** (`/register/index.html`) - User registration
- **Admin Dashboard** (`/dashboard-admin/index.html`) - Admin interface
- **Worker Dashboard** (`/worker-dashboard/index.html`) - Worker interface

## 🔗 Internal Links

Update your HTML files to use these paths for navigation:

```html
<!-- Landing page -->
<a href="/">Home</a>

<!-- Login -->
<a href="/login/">Login</a>

<!-- Register -->
<a href="/register/">Register</a>

<!-- Admin Dashboard -->
<a href="/dashboard-admin/">Admin Dashboard</a>

<!-- Worker Dashboard -->
<a href="/worker-dashboard/">Worker Dashboard</a>
```

## 💡 Tips

- All styling and scripts are self-contained within each page directory
- The root `style.css` is for the landing page only
- Each subdirectory contains its own `style.css` for page-specific styling
- JavaScript files are included locally in each page

## 📝 Notes

- This is a static site configuration
- For dynamic features, consider adding a backend (Node.js, Python, etc.)
- Ensure all relative paths in your HTML/JS files point correctly to stylesheets and scripts
