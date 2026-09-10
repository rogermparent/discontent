/**
 * The shape a content server action returns to `useActionState`.
 *
 * This lives in `@discontent/cms` rather than in a site, because
 * `createGenericActions` is generic over it — and for a while that one type
 * import was the *only* thing keeping the generic write path tied to the recipe
 * site. Any site can now build on the same actions without depending on
 * recipe-website-common.
 *
 * `formData` is the echo-back channel: on a failed round-trip the action returns
 * the values it parsed, and the form shell remounts keyed on `message` so the
 * fields pick them up (`useForm` captures its defaults at mount, so without the
 * remount a user's typing is silently discarded).
 */
export type ContentFormState<
  TErrors extends Record<string, string[] | undefined> = Record<
    string,
    string[] | undefined
  >,
  TFormData = Record<string, unknown>,
> = {
  errors?: TErrors;
  message: string;
  slugConflict?: string;
  formData?: TFormData;
};
