# Paro

Paro is a shared expense tracking PWA built with React, Vite, Tailwind, Supabase, and Vercel.

## Stage 1: project setup, Supabase schema, and auth

### 1. Create the app

```bash
npm create vite@latest . -- --template react
npm install
npm install tailwindcss @tailwindcss/vite @supabase/supabase-js
```

### 2. Configure environment variables

Copy [.env.example](.env.example) to .env.local and add your Supabase values.

> If deploying, also set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your deployment environment (for example, Vercel environment variables).

### 3. Apply the SQL schema

Open the Supabase SQL Editor and run the statements in [supabase/schema.sql](supabase/schema.sql).

### 4. Enable Supabase Auth

In the Supabase dashboard:

- Go to Authentication > Providers
- Enable the Email provider
- Turn on email confirmations if you want a stricter sign-up flow

### 5. Run the app

```bash
npm run dev
```
