import { z } from 'zod';

// Must stay in sync with LANGUAGE_MAP in backend src/utils/judge0.js
export const LANGUAGES = ['cpp', 'c', 'java', 'python', 'javascript'];

// Display labels — internal values stay lowercase (must match the backend
// enum/Judge0 map), this is only for what the user sees.
export const LANGUAGE_LABELS = {
  cpp: 'C++',
  c: 'C',
  java: 'Java',
  python: 'Python',
  javascript: 'JavaScript',
};

const languageEnum = z.enum(LANGUAGES);

// Boilerplate dropped into a code block when a language row is added, so the
// admin edits a skeleton instead of an empty box. Java keeps `public class Main`
// (required by Judge0 language id 62).
export const STARTER_SCAFFOLDS = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // read input from stdin, print the answer to stdout
    return 0;
}
`,
  c: `#include <stdio.h>

int main() {
    // read input from stdin, print the answer to stdout
    return 0;
}
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // read input, print the answer
    }
}
`,
  python: `import sys

def main():
    data = sys.stdin.read().split()
    # compute and print the answer

main()
`,
  javascript: `const data = require('fs').readFileSync(0, 'utf8').split(/\\s+/);
// compute and print the answer
`,
};

const visibleCase = z.object({
  input: z.string().min(1, 'Input is required'),
  output: z.string().min(1, 'Output is required'),
  explanation: z.string().min(1, 'Explanation is required'),
});

const hiddenCase = z.object({
  input: z.string().min(1, 'Input is required'),
  output: z.string().min(1, 'Output is required'),
});

const starterEntry = z.object({
  language: languageEnum,
  initialCode: z.string().min(1, 'Initial code is required'),
});

const solutionEntry = z.object({
  language: languageEnum,
  completeCode: z.string().min(1, 'Solution code is required'),
});

export const problemSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  // Comma-separated in the form; split into an array on submit.
  tags: z.string().min(1, 'Add at least one tag'),
  visibleTestCase: z.array(visibleCase).min(1, 'Add at least one visible test case'),
  hiddenTestCase: z.array(hiddenCase).min(1, 'Add at least one hidden test case'),
  startCode: z.array(starterEntry).min(1, 'Add starter code for at least one language'),
  referenceSolution: z
    .array(solutionEntry)
    .min(1, 'Add a reference solution for at least one language'),
});

// Shape of a pasted problem object (the questions.json shape): same as the
// backend payload, with `tags` as an array of strings. Used by the JSON paste
// mode to validate before hydrating the form.
export const problemJsonSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string().min(1)).min(1, 'Add at least one tag'),
  visibleTestCase: z.array(visibleCase).min(1, 'Add at least one visible test case'),
  hiddenTestCase: z.array(hiddenCase).min(1, 'Add at least one hidden test case'),
  startCode: z.array(starterEntry).min(1, 'Add starter code for at least one language'),
  referenceSolution: z
    .array(solutionEntry)
    .min(1, 'Add a reference solution for at least one language'),
});
