# React + TypeScript + Vite

---

# 🚀 Zimozo POS - Multi-Platform Cloud Build System (CI/CD)

We have configured a fully automated cloud-based building pipeline using **GitHub Actions**. Since you do not have an **iMac** or **iPhone**, this setup will build, compile, and package your apps for **all 4 platforms in the cloud** for free!

Whenever you push your code to your GitHub repository, the cloud servers will automatically compile:
1. 🤖 **Android Mobile**: Generates `app-debug.apk` directly.
2. 💻 **macOS (iMac/MacBook)**: Generates a ready-to-run `.dmg` and `.zip` bundle.
3. 💻 **Windows Desktop**: Generates the `.exe` installer and portable packages.
4. 🍎 **iOS (iPhone/iPad)**: Compiles the Xcode workspace and produces an unsigned `.ipa` for local testing/deployment.

---

## 🛠️ How to Use the Cloud Build System

### 1. Push Your Code to GitHub
Ensure you have set up your remote repository on GitHub, then run:
```bash
git add .
git commit -m "feat: implement database isolation, sidebar scrolling, and actions build workflow"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

### 2. Monitor and Download Your Builds
1. Navigate to your repository on **GitHub.com**.
2. Click on the **Actions** tab at the top.
3. You will see a workflow named **"Build Zimozo POS on All Platforms"** running.
4. Once completed (green checkmark), click on the build run.
5. Scroll down to the **Artifacts** section at the bottom, where you can download:
   * 🤖 `zimozo-pos-android` (contains your Android APK)
   * 💻 `zimozo-pos-desktop` (contains your Windows `.exe` and macOS `.dmg` / `.zip`)
   * 🍎 `zimozo-pos-ios` (contains your Xcode build workspace and `.ipa`)

---

## ⚡ React + TypeScript + Vite Template Details

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
