"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useMemo,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";

export interface FormErrorEntry {
  fieldId: string;
  label: string;
  message: string;
}

export interface FormContextValue {
  errors: ReadonlyArray<FormErrorEntry>;
}

const FormCtx = createContext<FormContextValue | null>(null);

/**
 * useFormContext — fields/components read this to know whether the form
 * is currently in an errored state. Optional — returns null outside a Form.
 */
export function useFormContext(): FormContextValue | null {
  return useContext(FormCtx);
}

export interface FormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, "children"> {
  /**
   * Server-side or async-validated error list. When non-empty, an
   * <ErrorSummary> region is rendered at the top of the form with
   * role="alert" + aria-live="assertive" so SRs announce on submit.
   */
  errorSummary?: ReadonlyArray<FormErrorEntry>;
  children: ReactNode;
  noValidate?: boolean;
}

const Form = forwardRef<HTMLFormElement, FormProps>(function Form(
  { errorSummary, children, noValidate = true, ...rest },
  ref,
) {
  const value = useMemo<FormContextValue>(
    () => ({ errors: errorSummary ?? [] }),
    [errorSummary],
  );

  return (
    <FormCtx.Provider value={value}>
      <form ref={ref} noValidate={noValidate} {...rest}>
        {errorSummary && errorSummary.length > 0 ? (
          <div
            className="az-form__error-summary"
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
          >
            <p className="az-form__error-summary-title">
              There {errorSummary.length === 1 ? "is" : "are"}{" "}
              {errorSummary.length} problem
              {errorSummary.length === 1 ? "" : "s"} with this form.
            </p>
            <ul className="az-form__error-summary-list">
              {errorSummary.map((err) => (
                <li key={err.fieldId}>
                  <a href={`#${err.fieldId}`}>
                    {err.label}: {err.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {children}
      </form>
    </FormCtx.Provider>
  );
});

export { Form };
