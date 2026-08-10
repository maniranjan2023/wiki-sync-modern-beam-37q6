import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react-icons', 'react-icons/*'],
              message: "react-icons is banned. Use lucide-react instead: import { IconName } from 'lucide-react'",
            },
          ],
        },
      ],
    },
  },
]

export default eslintConfig
