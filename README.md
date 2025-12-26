# 📊 Holdings Manager

A modern, cloud-based web application for consolidating and managing shareholding data from multiple Excel/CSV files. Built with React, TypeScript, and Supabase for seamless authentication and data storage.

![React](https://img.shields.io/badge/React-19.2.0-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-7.2.4-646CFF?logo=vite)
![Supabase](https://img.shields.io/badge/Supabase-2.86.0-3ECF8E?logo=supabase)

## ✨ Features

- **🔐 Secure Authentication**: Google OAuth integration via Supabase
- **📤 Bulk File Upload**: Drag-and-drop support for multiple Excel/CSV files
- **🔄 Auto Pivot Tables**: Automatically consolidates holdings across multiple accounts
- **💾 Cloud Storage**: Save and retrieve pivot tables securely in Supabase
- **📊 Interactive Tables**: Sortable columns for easy data analysis
- **📥 Export Options**: Download consolidated data as CSV or Excel
- **🎨 Modern UI**: Clean, responsive interface built with React and CSS

## 🚀 Live Demo

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?logo=vercel)](https://holding-manager.vercel.app/)

## 📋 Prerequisites

- Node.js 18+ and npm
- A Supabase account ([Sign up for free](https://supabase.com))
- A Google Cloud Project (for OAuth) - optional but recommended

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Abhay-Maheshwari/HoldingManager
   cd HoldingManager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   
   You can find these values in your Supabase project settings:
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Select your project
   - Navigate to **Settings** → **API**

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   
   Navigate to `http://localhost:5173`

## 🗄️ Supabase Setup

### 1. Create Database Table

Run this SQL in your Supabase SQL Editor:

```sql
-- Create saved_pivots table
CREATE TABLE saved_pivots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE saved_pivots ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own pivots
CREATE POLICY "Users can view own pivots"
  ON saved_pivots FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own pivots
CREATE POLICY "Users can insert own pivots"
  ON saved_pivots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can delete their own pivots
CREATE POLICY "Users can delete own pivots"
  ON saved_pivots FOR DELETE
  USING (auth.uid() = user_id);
```

### 2. Configure Google OAuth (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable **Google+ API**
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
6. Copy Client ID and Client Secret
7. In Supabase Dashboard → **Authentication** → **Providers** → **Google**:
   - Enable Google provider
   - Add your Client ID and Client Secret
   - Click **Save**

### 3. Configure Redirect URLs

In Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: `https://your-app.vercel.app` (or `http://localhost:5173` for local dev)
- **Redirect URLs**: Add the following:
  ```
  https://your-app.vercel.app
  https://your-app.vercel.app/**
  http://localhost:5173
  http://localhost:5174
  ```

## 📦 Deployment

### Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click **New Project**
   - Import your GitHub repository
   - Select the `holdings-manager-react` folder as root directory

3. **Configure Build Settings**
   - **Framework Preset**: Vite
   - **Root Directory**: `holdings-manager-react`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

4. **Add Environment Variables**
   - Go to **Project Settings** → **Environment Variables**
   - Add:
     - `VITE_SUPABASE_URL` = Your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` = Your Supabase anon key
   - Redeploy after adding environment variables

5. **Update Supabase Site URL**
   - After deployment, update Supabase **Site URL** to your Vercel URL
   - This prevents redirects to localhost after OAuth

## 🔧 Troubleshooting

### OAuth redirects to localhost

**Problem**: After Google login, you're redirected to `localhost:3000` instead of your Vercel URL.

**Solution**:
1. Check **Site URL** in Supabase Dashboard → **Authentication** → **URL Configuration**
2. It should be set to your Vercel URL: `https://your-app.vercel.app`
3. Wait 1-2 minutes for changes to propagate
4. Clear browser cache or use incognito mode
5. Test the login flow again

### Build fails on Vercel

**Check**:
- Root directory is set correctly
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables are set for **Production**, **Preview**, and **Development**

### No data extracted from files

**Check**:
- File format matches expected structure (company name in column 1, quantity in column 9)
- Files are valid Excel (.xlsx) or CSV format
- Check browser console for parsing errors
- Try uploading a sample file to see debug preview

## 🏗️ Project Structure

```
holdings-manager-react/
├── public/
│   ├── logo.png
│   └── vite.svg
├── src/
│   ├── contexts/
│   │   └── AuthContext.tsx      # Authentication context
│   ├── lib/
│   │   └── supabase.ts          # Supabase client configuration
│   ├── App.tsx                  # Main application component
│   ├── App.css                  # Application styles
│   ├── index.css                # Global styles
│   └── main.tsx                 # Application entry point
├── .env                         # Environment variables (not in git)
├── index.html
├── package.json
├── tsconfig.json
├── vercel.json                  # Vercel deployment config
└── vite.config.ts
```

## 🧪 Technologies Used

- **React 19.2.0** - UI framework
- **TypeScript 5.9.3** - Type safety
- **Vite 7.2.4** - Build tool and dev server
- **Supabase** - Backend (Auth + Database)
- **Lucide React** - Icon library
- **SheetJS (xlsx)** - Excel file parsing

## 📝 Usage

1. **Sign In**: Use Google OAuth to authenticate
2. **Upload Files**: Drag and drop or browse for Excel/CSV files containing shareholding data
3. **View Pivot**: The app automatically creates a pivot table consolidating holdings across all files
4. **Save**: Save pivot tables to cloud storage for later access
5. **Export**: Download consolidated data as CSV or Excel
6. **Sort**: Click column headers to sort data

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 👤 Author

**Your Name**
- GitHub: [@Dhruvraj-Rana](https://github.com/Dhruvraj-Rana)


## 🙏 Acknowledgments

- [Supabase](https://supabase.com) for the amazing backend platform
- [Vercel](https://vercel.com) for seamless deployment
- [Lucide](https://lucide.dev) for beautiful icons

---

⭐ If you found this project helpful, please give it a star!

