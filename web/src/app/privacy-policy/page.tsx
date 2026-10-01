import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | The School Admission",
  description: "How The School Admission handles admission enquiries and CRM data, including Meta Instant Form leads.",
};

const sections = [
  {
    title: "Information we collect",
    text: "We collect information you provide when requesting admission guidance, including parent or student names, phone numbers, email addresses, location, class sought, school preferences and other enquiry details. Sources include our website, Facebook and Instagram Instant Forms, and enquiries you send by phone, email or WhatsApp. Our CRM also records counselling notes, follow-up tasks, school referrals and admission progress. Staff accounts contain login and role information. Server logs may record technical information such as IP addresses, request times and browser details.",
  },
  {
    title: "Meta lead information",
    text: "When you submit an Instant Form associated with our Facebook or Instagram advertisements, our Meta integration receives a lead notification and retrieves the submitted information through Meta’s API. It may also receive lead, form and advertisement identifiers to identify the enquiry and avoid duplicate imports. We use this information to respond to your enquiry and manage admission counselling. Meta processes information under its own privacy policy.",
  },
  {
    title: "How we use information",
    text: "We use enquiry information to contact you about your request, understand admission requirements, recommend relevant schools, arrange follow-ups and track referrals or admission outcomes. We use staff account and technical information to operate the CRM, control access and investigate service issues. You can ask us to stop further counselling communications using the contact details below.",
  },
  {
    title: "Access and sharing",
    text: "Authorised staff use enquiry information for counselling and administration. Where you request or authorise a school referral, relevant information may be shared with that school to support your admission enquiry. Providers supporting hosting, communications and operation of our services may process information for those services. Information may also be disclosed where required by applicable law. Schools and external platforms have their own privacy practices; please review them before providing additional information directly.",
  },
  {
    title: "Storage, security and retention",
    text: "The CRM stores enquiry records in our service database and restricts CRM access through staff authentication and roles. No method of storage or transmission is completely secure. We retain information as needed to handle enquiries, maintain relevant admission records and meet applicable obligations. You may contact us to request deletion or ask about retention of your record. Some information may need to be retained for legal obligations or resolving disputes.",
  },
  {
    title: "Student and children’s information",
    text: "Admission enquiries may include information about children. Parents or guardians should submit or oversee enquiries concerning a child and provide only information needed for admission guidance. If you believe a child’s information has been submitted without appropriate permission, please contact us so we can review the record and the request.",
  },
  {
    title: "Cookies and external services",
    text: "The CRM uses authentication cookies to maintain staff login sessions. External services, including Meta and WhatsApp, may use their own cookies or process information separately. This policy covers The School Admission’s handling of CRM and enquiry information; it does not replace those services’ privacy policies.",
  },
  {
    title: "Access, correction and deletion requests",
    text: "To request access to, correction of or deletion of your information, or to stop counselling communications, email support@theschooladmission.com. For deletion, use the subject ‘Data deletion request’ and include the phone number or email used for your enquiry so we can locate the record. We may ask for information needed to verify your identity or your authority as a parent or guardian. Do not send passwords or access tokens. We will review your request and explain any applicable limits on deletion.",
  },
  {
    title: "Policy updates",
    text: "We may update this policy when our services or information practices change. The latest version will be published on this page with an updated date.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900 sm:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <header className="border-b border-slate-200 pb-7">
          <p className="mb-3 text-sm font-semibold tracking-wide text-blue-700">The School Admission</p>
          <h1 className="text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated: 1 October 2026</p>
          <p className="mt-5 leading-7 text-slate-700">
            This policy explains how The School Admission handles information collected for school admission guidance and stored in our CRM at tsacrm.io. For privacy questions, contact{" "}
            <a className="break-words text-blue-700 underline" href="mailto:support@theschooladmission.com">support@theschooladmission.com</a>.
          </p>
        </header>
        <div className="space-y-8 pt-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-3 leading-7 text-slate-700">{section.text}</p>
            </section>
          ))}
        </div>
        <footer className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-600">
          Privacy and data deletion contact:{" "}
          <a className="break-words text-blue-700 underline" href="mailto:support@theschooladmission.com">support@theschooladmission.com</a>
        </footer>
      </article>
    </main>
  );
}
