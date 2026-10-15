// One gallery card per AI design: [{ job, variation }] from listAiCalendarJobs().
export const flattenGeneratedDesigns = (jobs) =>
  jobs.flatMap((job) =>
    job.variations.filter((v) => v.status !== "FAILED").map((variation) => ({ job, variation })),
  );
