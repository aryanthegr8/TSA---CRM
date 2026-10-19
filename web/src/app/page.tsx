"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700", "800"] });
const body = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"] });

const STAGES = [
  { name: "Enquiry", color: "#FF8A5B" },
  { name: "Campus visit", color: "#4F46E5" },
  { name: "Applied", color: "#0EA5E9" },
  { name: "Admitted", color: "#12B5A6" },
];

const STUDENTS = [
  { n: "Aarav Sharma", g: "Grade 6" },
  { n: "Meera Iyer", g: "Grade 1" },
  { n: "Kabir Singh", g: "Grade 9" },
  { n: "Ananya Rao", g: "Grade 4" },
  { n: "Vihaan Gupta", g: "Grade 11" },
  { n: "Ishita Das", g: "Grade 2" },
];

function PipelineBoard() {
  const [stages, setStages] = useState([0, 1, 0, 2, 1, 0]);
  const [moved, setMoved] = useState(-1);

  useEffect(() => {
    const id = setInterval(() => {
      setStages((prev) => {
        const next = [...prev];
        const candidates = next.map((s, i) => (s < 3 ? i : -1)).filter((i) => i >= 0);
        if (candidates.length === 0) return [0, 1, 0, 2, 1, 0];
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        next[pick] += 1;
        setMoved(pick);
        return next;
      });
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="board rounded-3xl border border-white/60 bg-white/70 p-4 shadow-[0_40px_80px_-30px_rgba(40,40,120,.35)] backdrop-blur-xl sm:p-5">
      <div className="mb-4 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="live-dot h-2.5 w-2.5 rounded-full bg-[#12B5A6]" />
          <span className="text-sm font-bold text-[#12183A]">Admissions 2026–27</span>
        </div>
        <span className="rounded-full bg-[#12183A]/5 px-3 py-1 text-xs font-medium text-[#12183A]/60">Live pipeline</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAGES.map((st, si) => (
          <div key={st.name} className="min-h-[190px] rounded-2xl bg-[#F1F3FA] p-2.5">
            <div className="mb-2.5 flex items-center gap-1.5 px-1 text-xs font-bold text-[#12183A]/70">
              <span className="h-2 w-2 rounded-full" style={{ background: st.color }} />
              {st.name}
              <span className="ml-auto text-[#12183A]/40">{stages.filter((s) => s === si).length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {STUDENTS.map((s, i) =>
                stages[i] === si ? (
                  <div
                    key={s.n + si}
                    className={`rounded-xl bg-white p-2.5 shadow-sm ${moved === i ? "card-in" : ""}`}
                    style={{ borderLeft: `3px solid ${st.color}` }}
                  >
                    <div className="text-[13px] font-bold text-[#12183A]">{s.n}</div>
                    <div className="text-xs text-[#12183A]/50">{s.g}</div>
                  </div>
                ) : null
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min((t - t0) / 1600, 1);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{v.toLocaleString()}{suffix}</span>;
}

const FEATURES = [
  { t: "Every enquiry in one place", d: "Website forms, calls, walk-ins and WhatsApp land in a single inbox, assigned to the right counsellor automatically.", span: "lg:col-span-2", bg: "#4F46E5", light: true },
  { t: "Follow-ups that never slip", d: "Reminders for calls, campus visits and document deadlines.", span: "", bg: "#FFFFFF", light: false },
  { t: "Document checklist", d: "Parents upload birth certificates and transfer certificates; staff verify with one tap.", span: "", bg: "#FFFFFF", light: false },
  { t: "Fee and seat tracking", d: "See seats filled per grade, pending registration fees and offers about to expire.", span: "lg:col-span-2", bg: "#12183A", light: true },
];

const STEPS = [
  { t: "Enquiry", d: "Parent submits the form or calls. A lead is created instantly." },
  { t: "Campus visit", d: "Book a tour and send an automatic reminder." },
  { t: "Application", d: "Collect documents and the registration fee online." },
  { t: "Admission", d: "Issue the offer letter and confirm the seat." },
];

export default function Home() {
  return (
    <div className={`${body.className} relative min-h-screen overflow-x-clip bg-[#F5F7FB] text-[#12183A]`}>
      <style>{`
        .blob{position:absolute;border-radius:9999px;filter:blur(80px);opacity:.55;animation:drift 18s ease-in-out infinite alternate}
        @keyframes drift{to{transform:translate3d(60px,40px,0) scale(1.15)}}
        @keyframes rise{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
        .rise{opacity:0;animation:rise .8s cubic-bezier(.2,.7,.2,1) forwards}
        .d1{animation-delay:.1s}.d2{animation-delay:.25s}.d3{animation-delay:.4s}.d4{animation-delay:.6s}
        @keyframes cardin{from{opacity:0;transform:translateX(-14px) scale(.96)}to{opacity:1;transform:none}}
        .card-in{animation:cardin .5s cubic-bezier(.2,.8,.2,1)}
        @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(18,181,166,.6)}100%{box-shadow:0 0 0 10px rgba(18,181,166,0)}}
        .live-dot{animation:pulse 1.6s infinite}
        @keyframes float{50%{transform:translateY(-10px)}}
        .board{animation:float 7s ease-in-out infinite}
        .shine{background:linear-gradient(100deg,#4F46E5,#0EA5E9 45%,#12B5A6 70%,#4F46E5);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:slide 6s linear infinite}
        @keyframes slide{to{background-position:200% center}}
        @media (prefers-reduced-motion:reduce){.blob,.board,.shine,.live-dot{animation:none}.rise{animation:none;opacity:1}.card-in{animation:none}}
      `}</style>

      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="blob -left-24 top-0 h-96 w-96 bg-[#C7C2FF]" />
        <div className="blob right-0 top-40 h-[28rem] w-[28rem] bg-[#FFD3BF]" style={{ animationDelay: "-6s" }} />
        <div className="blob bottom-0 left-1/3 h-80 w-80 bg-[#B6F0EA]" style={{ animationDelay: "-11s" }} />
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-white/50 bg-white/60 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" className={`${display.className} flex items-center gap-2 text-xl font-extrabold`}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#4F46E5] text-white">T</span>
            TSA CRM
          </Link>
          <div className="hidden gap-8 text-sm font-medium text-[#12183A]/70 md:flex">
            <a href="#features" className="hover:text-[#4F46E5]">Features</a>
            <a href="#how" className="hover:text-[#4F46E5]">How it works</a>
            <a href="#results" className="hover:text-[#4F46E5]">Results</a>
          </div>
          <Link href="/login" className="rounded-full bg-[#12183A] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#4F46E5]">
            Staff login
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1fr_1.15fr] lg:pt-24">
          <div>
            <p className="rise d1 mb-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-medium shadow-sm">
              <span className="live-dot h-2 w-2 rounded-full bg-[#FF8A5B]" /> Admissions 2026–27 are open
            </p>
            <h1 className={`${display.className} rise d2 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl`}>
              Turn every enquiry into an <span className="shine">enrolled student</span>
            </h1>
            <p className="rise d3 mt-6 max-w-lg text-lg leading-8 text-[#12183A]/65">
              TSA CRM helps your admissions team track every family from first call to confirmed seat, with nothing lost along the way.
            </p>
            <div className="rise d4 mt-9 flex flex-wrap gap-4">
              <Link href="/login" className="group rounded-full bg-[#4F46E5] px-7 py-4 font-bold text-white shadow-[0_12px_30px_-8px_rgba(79,70,229,.6)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-8px_rgba(79,70,229,.7)]">
                Open dashboard
              </Link>
              <a href="#how" className="rounded-full border border-[#12183A]/15 bg-white/70 px-7 py-4 font-bold transition hover:bg-white">
                See how it works
              </a>
            </div>
          </div>
          <div className="rise d4"><PipelineBoard /></div>
        </section>

        {/* Stats */}
        <section id="results" className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-[#12183A]/10 lg:grid-cols-4">
            {[
              { v: 12000, s: "+", l: "Enquiries managed" },
              { v: 3, s: "x", l: "Faster follow-up" },
              { v: 98, s: "%", l: "Documents verified on time" },
              { v: 40, s: "%", l: "More campus visits booked" },
            ].map((x) => (
              <div key={x.l} className="bg-white/80 p-7 backdrop-blur sm:p-9">
                <div className={`${display.className} text-4xl font-extrabold text-[#4F46E5] sm:text-5xl`}>
                  <Counter to={x.v} suffix={x.s} />
                </div>
                <div className="mt-2 text-sm font-medium text-[#12183A]/60">{x.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <h2 className={`${display.className} max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl`}>
            Built for the way admission offices actually work
          </h2>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.t}
                className={`${f.span} group rounded-3xl p-8 transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${f.light ? "text-white" : "border border-[#12183A]/10"}`}
                style={{ background: f.bg }}
              >
                <h3 className={`${display.className} text-2xl font-bold`}>{f.t}</h3>
                <p className={`mt-3 max-w-md leading-7 ${f.light ? "text-white/75" : "text-[#12183A]/65"}`}>{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps: a real sequence */}
        <section id="how" className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
          <h2 className={`${display.className} text-4xl font-extrabold tracking-tight sm:text-5xl`}>From first call to first day</h2>
          <ol className="relative mt-14 grid gap-10 md:grid-cols-4">
            <div className="absolute left-0 right-0 top-5 hidden h-0.5 bg-gradient-to-r from-[#FF8A5B] via-[#4F46E5] to-[#12B5A6] md:block" />
            {STEPS.map((s, i) => (
              <li key={s.t} className="relative">
                <span
                  className="relative grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white"
                  style={{ background: STAGES[i].color }}
                >
                  {i + 1}
                </span>
                <h3 className={`${display.className} mt-5 text-xl font-bold`}>{s.t}</h3>
                <p className="mt-2 leading-7 text-[#12183A]/65">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#12183A] px-8 py-16 text-center text-white sm:px-16">
            <div className="blob -left-10 -top-10 h-64 w-64 bg-[#4F46E5]" />
            <div className="blob -bottom-10 right-0 h-64 w-64 bg-[#12B5A6]" style={{ animationDelay: "-8s" }} />
            <div className="relative">
              <h2 className={`${display.className} mx-auto max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl`}>
                Ready to fill every seat this year?
              </h2>
              <Link href="/login" className="mt-8 inline-block rounded-full bg-white px-8 py-4 font-bold text-[#12183A] transition hover:-translate-y-0.5 hover:bg-[#FFD3BF]">
                Open dashboard
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[#12183A]/10 py-8 text-center text-sm text-[#12183A]/50">
        © {new Date().getFullYear()} TSA CRM. All rights reserved.
      </footer>
    </div>
  );
}
