This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## CRM local setup

Copy `.env.example` to `.env.local`, provide the local database credentials, and set `AUTH_SECRET` to a random 32-byte secret. In the CRM database, add `password_hash VARCHAR(255) NULL` to `crm_users` if you have not already done so. Run `npm ci`, `npm run create-admin`, then `npm run dev`. Sign in at `/login`.

## First lead workflow

Use `/leads` for the latest 100 enquiries. Counsellors see only their assigned leads; admins and managers see all leads. Use **Add lead** to create a manual enquiry and a first follow-up in India time. The family, lead, task, and activity are inserted together in a transaction.

This first version creates a new family on every submission. Use test leads for now. Matching existing families, editing leads, completing follow-ups, and school referrals are the next modules. Do not import historical leads until family matching is implemented.

All future data pages, route handlers, and server actions must check the signed-in user and permitted role on the server.
