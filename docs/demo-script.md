# Demo script — five minutes

Rehearse this out loud three times on the actual presentation device. Reading it silently does not
count; you will discover the awkward sentences only when you say them.

---

## Pre-flight (do this 30 minutes before)

- [ ] App deployed and loaded in a browser tab **already open**. Never deploy during the demo.
- [ ] Logged in already. Auth is the most likely thing to fail on stage.
- [ ] Confirm you are **not** in demo mode — check that login didn't return `isDemo: true`.
- [ ] Run each demo question once to warm caches and confirm the answers are what you expect.
- [ ] Eval tab loaded **in a second tab, already rendered.** It calls retrieval once per question
      and is slow — never load it live.
- [ ] Phone on the same content, in case the projector fails.
- [ ] Screenshots of all four moments in a folder, in order. Your fallback if wifi dies.
- [ ] Conference wifi tested. If it's bad, tether to a phone and test that instead.
- [ ] Laptop plugged in. Notifications off. Battery-saver off.

**Assign one person to drive and one to talk.** The driver never improvises a question.

---

## The run

### 0:00–0:40 — Hook

Don't open with the tech. Open with the student.

> "A Class 10 student in Pakistan asks ChatGPT to explain Ohm's law. They get a fluent, confident
> answer — from the wrong curriculum. They write it in a board exam and lose the marks, and they
> never find out why. Their classmate with a tuition teacher doesn't have that problem. That's the
> gap we're closing."

Go straight to the live app. No slides yet.

### 0:40–1:30 — The grounded answer

Ask an in-syllabus question. Recommended: **"What is Ohm's law?"**

Let it render. Don't narrate the loading.

When the answer appears, point at the **citation chip** and say one sentence:

> "Chapter 14, page 95. That's the actual page in the actual PCTB textbook. The student can open
> their book and check us."

Tap the chip to expand the excerpt. Then stop talking. Let them read it.

### 1:30–2:10 — The refusal (your strongest 20 seconds)

> "Now watch what happens when we ask something that isn't in this syllabus."

Ask: **"Explain the mechanism of an organic SN2 reaction."**

**Say nothing while it renders.** Let the refusal card appear in silence.

Then:

> "It declined. It showed the nearest chapters it *does* cover. And notice it came back faster —
> because when our confidence gate says refuse, the language model is never called at all. There's
> no code path where it can invent an answer."

This is the moment that separates you. Do not rush it, and do not talk over it.

### 2:10–2:40 — Urdu voice (optional, second only)

Only if Day 5 landed and rehearsal was clean. Tap the mic, ask a physics question in Urdu, let the
transcription land in the box, submit.

> "Same grounding, in the student's own language — typed, spoken, or in Roman Urdu."

**If transcription fails, type it instead and keep talking.** The text box is always visible for
exactly this reason. A failed transcription is a shrug, not a stall. Never retry more than once.

### 2:40–3:20 — How it works

One architecture slide. Plain language, no jargon.

> "Question comes in, we search only the ingested textbook for this student's board, class and
> subject. We score how well it matched. If the score clears a threshold we calibrated against a
> labelled test set, we send *only those retrieved pages* to the model and require it to cite them.
> If it doesn't clear the threshold, we stop — before the model is ever called."

Then switch to the eval tab (already loaded):

> "We measured this. *N* hand-labelled questions, including near-miss cases from Class 9 and
> Class 11 physics — same subject, wrong syllabus, the genuinely hard ones. Off-syllabus false
> acceptance: *X*%."

Quote your real numbers. Never round in your favour.

### 3:20–4:10 — Why it matters

> "Millions of students sit board exams every year across several provincial syllabi. Access to
> tuition tracks income and geography. A free, syllabus-grounded tutor in Urdu is a direct
> equity play."

Then the business case, briefly: freemium for students, B2B licensing to schools, tuition academies
and NGO networks, with a longer-term path to a provincial education-department partnership.

### 4:10–4:40 — Roadmap and team

Next boards and subjects to ingest, then one line per teammate naming what they actually built.
Real ownership reads as a real team.

### 4:40–5:00 — Close

Back to the live app. Restate the hook in one sentence. End on the product, not a slide.

> "Other AI tutors answer confidently from the wrong curriculum. Sabaq AI answers only from your
> actual textbook, shows you the page, and honestly refuses when your syllabus doesn't cover it.
> And we can show you the numbers."

---

## When something breaks

| What fails | What you do |
| --- | --- |
| Answer is slow | Keep talking about the citation model. Do not click again — you'll queue a second request. |
| Wrong/no answer | "That's a retrieval miss — here's what it looks like when it works," and switch to screenshots. Naming a miss honestly costs you far less than fumbling. |
| Voice doesn't transcribe | Type it. Move on. One retry maximum. |
| Wifi dies | Screenshots, in order, same narration. You rehearsed this. |
| Judge asks something you don't know | "I don't know — I'd have to check." Never invent. You are pitching a product whose entire premise is refusing to bluff. Bluffing on stage undoes the whole argument. |

---

## Questions you will be asked

Full answers are in `docs/submission.md`. The four most likely:

- **"How do you know it won't hallucinate?"** → the guardrail blocks the call, plus your measured
  false-acceptance number.
- **"Why only one board and class?"** → deliberate depth over breadth; the architecture is
  board-agnostic and adding more is a data-loading exercise, not a rebuild.
- **"What's different from ChatGPT?"** → grounding, citation, honest refusal, measured.
- **"Where did the textbook content come from?"** → answer this honestly and in one sentence. Have
  it ready before you walk on stage.
