import TopJobEmails from "@/components/jobs/TopJobEmails";

export default function TodayPage() {
  return (
    <TopJobEmails
      title="Today"
      eyebrow="Top jobs by pinned files"
      description="Start with the job and recruiter emails most worth reading, ranked against your pinned workspace context."
      dataTestId="today-top-jobs-view"
    />
  );
}
