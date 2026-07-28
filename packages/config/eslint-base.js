// @ts-check
import tseslint from "typescript-eslint";

/** Shared base ESLint flat config. Each app/package extends this array. */
export default tseslint.config(
  {
    ignores: ["**/dist/**", ".next/**", ".turbo/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
