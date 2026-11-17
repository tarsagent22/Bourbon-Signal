import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  { ignores: ['.next/**', 'apps/mobile/**', 'engine/out/**'] },
  ...compat.extends('next'),
];
