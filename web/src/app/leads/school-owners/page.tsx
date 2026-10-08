import LeadInbox from "../lead-inbox";

export default function Page({ searchParams }: { searchParams: Parameters<typeof LeadInbox>[0]["searchParams"] }) {
  return <LeadInbox searchParams={searchParams} inbox="school_owner" />;
}
