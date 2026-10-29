import { defineConfig } from "eslint/config"
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import sortClassMembers from "eslint-plugin-sort-class-members"

export default defineConfig([
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: {
      "sort-class-members": sortClassMembers
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "sort-class-members/sort-class-members": [
        "error",
        {
          order: [
            "[static-properties]",
            "[static-methods]",
            "[properties]",
            "constructor",
            "[abstract-methods]",
            "[public-methods]",
            "[methods]",
            "[conventional-private-methods]"
          ],
          groups: {
            "abstract-methods": [{ type: "method", abstract: true }],
            "public-methods": [{ type: "method", abstract: false, accessibility: "public" }],
            methods: [{ type: "method", abstract: false }]
          },
          accessorPairPositioning: "getThenSet"
        }
      ],
      "lines-between-class-members": [
        "error",
        {
          enforce: [
            { blankLine: "always", prev: "method", next: "method" },
            { blankLine: "always", prev: "method", next: "field" },
            { blankLine: "always", prev: "field", next: "method" }
          ]
        }
      ]
    }
  },
  {
    ignores: ["dist/**"]
  }
])
