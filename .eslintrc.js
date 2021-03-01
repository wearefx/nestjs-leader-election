module.exports = {
  root: true,
  extends: ["@fxd-dev-util/eslint-config-base"],
  env: {
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    project: ["./tsconfig.json", "./tsconfig.test-eslint.json"],
    tsconfigRootDir: __dirname,
  },
};
