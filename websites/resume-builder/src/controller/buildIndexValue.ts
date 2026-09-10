import { Resume, ResumeEntryValue } from "./types";

export default function buildResumeIndexValue(
  resume: Resume,
): ResumeEntryValue {
  const { company, job } = resume;
  return {
    company,
    job,
  };
}
