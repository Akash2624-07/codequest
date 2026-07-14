import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router';
import frontendClient from '../utils/axiosInstance';
import { problemSchema, LANGUAGES, STARTER_SCAFFOLDS } from '../schemas/problemSchema';
import BasicsSection from '../components/createProblem/BasicsSection';
import TestCaseSection from '../components/createProblem/TestCaseSection';
import CodeLanguageSection from '../components/createProblem/CodeLanguageSection';

// First language not already used, so adding a row picks a fresh one.
const nextLanguage = (used) => LANGUAGES.find((l) => !used.includes(l)) || 'cpp';

function EditProblem() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(problemSchema) });

  const visible = useFieldArray({ control, name: 'visibleTestCase' });
  const hidden = useFieldArray({ control, name: 'hiddenTestCase' });
  const starter = useFieldArray({ control, name: 'startCode' });
  const solution = useFieldArray({ control, name: 'referenceSolution' });

  useEffect(() => {
    frontendClient
      .get(`/problems/${id}`)
      .then(({ data }) => {
        reset({ ...data, tags: data.tags.join(', ') });
      })
      .catch(() => setPageError('Failed to load problem.'))
      .finally(() => setPageLoading(false));
  }, [id, reset]);

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
      await frontendClient.put(`/problems/${id}`, payload);
      navigate('/admin/problems');
    } catch (err) {
      const resData = err.response?.data;
      setServerError(
        (typeof resData === 'string' ? resData : resData?.message) ||
          err.message ||
          'Failed to update problem',
      );
    }
  };

  if (pageLoading)
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );

  if (pageError)
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-error">{pageError}</p>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Edit Problem</h1>

      {serverError && (
        <div className="alert alert-error mb-6 text-sm whitespace-pre-wrap">
          {serverError}
        </div>
      )}

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
          helperText="Each solution is re-run against all test cases on the server before the update is saved."
        />

        <button type="submit" className="btn btn-primary btn-lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="loading loading-spinner loading-sm" />
              Validating solutions…
            </>
          ) : (
            'Save Changes'
          )}
        </button>
      </form>
    </div>
  );
}

export default EditProblem;
