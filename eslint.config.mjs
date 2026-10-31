import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // ---- TypeScript quality gates (BioChem ships with zero `any`) ----
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      // React / Next pragmatics
      "react-hooks/exhaustive-deps": "warn",
      // Fetch-into-state effects are a deliberate, documented pattern for
      // Supabase client queries (see hooks/ and feature components); the rule
      // stays as a warning so genuinely cascading renders still surface.
      "react-hooks/set-state-in-effect": "warn",
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "warn",
    },
  },
  {
    // Vendored shadcn/ui primitives — not audited project code.
    files: ["src/components/ui/**"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-compiler/react-compiler": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "examples/**",
      "mini-services/**",
      "skills/**",
      ".zscripts/**",
      "download/**",
      "upload/**",
      "public/sw.js",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];

export default eslintConfig;
