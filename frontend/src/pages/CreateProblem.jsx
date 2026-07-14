import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import frontendClient from '../utils/axiosInstance';
import {
  problemSchema,
  problemJsonSchema,
  LANGUAGES,
  STARTER_SCAFFOLDS,
} from '../schemas/problemSchema';
import JsonImportSection from '../components/createProblem/JsonImportSection';
import BasicsSection from '../components/createProblem/BasicsSection';
import TestCaseSection from '../components/createProblem/TestCaseSection';
import CodeLanguageSection from '../components/createProblem/CodeLanguageSection';

const DEFAULT_VALUES = {
  title: '',
  description: '',
  difficulty: 'easy',
  tags: '',
  visibleTestCase: [{ input: '', output: '', explanation: '' }],
  hiddenTestCase: [{ input: '', output: '' }],
  startCode: [{ language: 'cpp', initialCode: STARTER_SCAFFOLDS.cpp }],
  referenceSolution: [{ language: 'cpp', completeCode: STARTER_SCAFFOLDS.cpp }],
};

// First language not already used, so adding a row picks a fresh one.
const nextLanguage = (used) => LANGUAGES.find((l) => !used.includes(l)) || 'cpp';

function CreateProblem() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState(null);
  const [mode, setMode] = useState('form'); // 'form' | 'json'
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(problemSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const visible = useFieldArray({ control, name: 'visibleTestCase' });
  const hidden = useFieldArray({ control, name: 'hiddenTestCase' });
  const starter = useFieldArray({ control, name: 'startCode' });
  const solution = useFieldArray({ control, name: 'referenceSolution' });

  // ── Language rows with scaffolds ─────────────────────────────
  const addStarter = () => {
    const lang = nextLanguage(starter.fields.map((f) => f.language));
    starter.append({ language: lang, initialCode: STARTER_SCAFFOLDS[lang] });
  };
  const addAllStarter = () => {
    const used = starter.fields.map((f) => f.language);
    LANGUAGES.filter((l) => !used.includes(l)).forEach((l) =>
      starter.append({ language: l, initialCode: STARTER_SCAFFOLDS[l] }),
    );
  };
  const addSolution = () => {
    const lang = nextLanguage(solution.fields.map((f) => f.language));
    solution.append({ language: lang, completeCode: STARTER_SCAFFOLDS[lang] });
  };
  const addAllSolution = () => {
    const used = solution.fields.map((f) => f.language);
    LANGUAGES.filter((l) => !used.includes(l)).forEach((l) =>
      solution.append({ language: l, completeCode: STARTER_SCAFFOLDS[l] }),
    );
  };

  // ── JSON paste mode ──────────────────────────────────────────
  const loadJson = () => {
    setJsonError(null);
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setJsonError(`Invalid JSON: ${e.message}`);
      return;
    }
    // Accept a single object or the first item of an array (questions.json).
    const obj = Array.isArray(parsed) ? parsed[0] : parsed;
    const result = problemJsonSchema.safeParse(obj);
    if (!result.success) {
      const issue = result.error.issues[0];
      setJsonError(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
      return;
    }
    // Hydrate the form (tags array → comma string) and switch back to review it.
    reset({ ...result.data, tags: result.data.tags.join(', ') });
    setServerError(null);
    setMode('form');
  };

  const onSubmit = async (data) => {
    setServerError(null);
    try {
      const payload = {
        ...data,
        tags: data.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      await frontendClient.post('/problems', payload);
      navigate('/');
    } catch (err) {
      // Backend sends plain-text errors (e.g. failed reference solution),
      // and JSON for some validation paths.
      const resData = err.response?.data;
      setServerError(
        (typeof resData === 'string' ? resData : resData?.message) ||
          err.message ||
          'Failed to create problem',
      );
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Create Problem</h1>
        <div className="join">
          <button
            type="button"
            className={`btn btn-sm join-item ${mode === 'form' ? 'btn-active' : ''}`}
            onClick={() => setMode('form')}
          >
            Form
          </button>
          <button
            type="button"
            className={`btn btn-sm join-item ${mode === 'json' ? 'btn-active' : ''}`}
            onClick={() => setMode('json')}
          >
            Paste JSON
          </button>
        </div>
      </div>

      {serverError && (
        <div className="alert alert-error mb-6 text-sm whitespace-pre-wrap">
          {serverError}
        </div>
      )}

      {mode === 'json' ? (
        <JsonImportSection
          jsonText={jsonText}
          setJsonText={setJsonText}
          jsonError={jsonError}
          onLoad={loadJson}
        />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8" noValidate>
          <BasicsSection register={register} errors={errors} />

          <TestCaseSection
            title="Visible Test Cases"
            basePath="visibleTestCase"
            fieldArray={visible}
            register={register}
            errors={errors}
            showExplanation
          />

          <TestCaseSection
            title="Hidden Test Cases"
            basePath="hiddenTestCase"
            fieldArray={hidden}
            register={register}
            errors={errors}
          />

          <CodeLanguageSection
            title="Starter Code"
            basePath="startCode"
            codeField="initialCode"
            fieldArray={starter}
            register={register}
            errors={errors}
            onAdd={addStarter}
            onAddAll={addAllStarter}
            rows={5}
            placeholder="// starter code"
          />

          <CodeLanguageSection
            title="Reference Solutions"
            basePath="referenceSolution"
            codeField="completeCode"
            fieldArray={solution}
            register={register}
            errors={errors}
            onAdd={addSolution}
            onAddAll={addAllSolution}
            rows={6}
            placeholder="// full working solution"
            helperText="Each solution is run against all test cases on the server before the problem is saved."
          />

          <button type="submit" className="btn btn-primary btn-lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Validating solutions…
              </>
            ) : (
              'Create Problem'
            )}
          </button>
        </form>
      )}
    </div>
  );
}

export default CreateProblem;
