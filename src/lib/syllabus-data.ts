import type { RetrievedChunk } from './types';

export interface IngestedChunkRecord {
  id: string;
  board: string;
  classLevel: number;
  subject: string;
  chapterNo: number;
  chapterTitle: string;
  section: string;
  pageFrom: number;
  pageTo: number;
  sourceType: 'textbook' | 'past_paper' | 'marking_scheme';
  language: 'en' | 'ur';
  content: string;
  contentHash: string;
  keywords: string[];
}

export const INITIAL_SYLLABUS_CHUNKS: IngestedChunkRecord[] = [
  {
    id: 'pctb-10-phy-ch14-01',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 14,
    chapterTitle: 'Current Electricity',
    section: '14.1 Electric Current',
    pageFrom: 91,
    pageTo: 92,
    sourceType: 'textbook',
    language: 'en',
    content: `Electric current is defined as the rate of flow of electric charge through any cross-sectional area of a conductor. If a charge Q flows through any cross-section of a conductor in time t, then the electric current I passing through it is given by: I = Q / t. The SI unit of electric current is Ampere (A). If a charge of one coulomb passes through any cross section of a conductor in one second, then the current through it is said to be one ampere. Conventional current flows from positive terminal to negative terminal, while electronic current is the flow of electrons from negative to positive terminal.`,
    contentHash: 'hash-phy-14-1',
    keywords: ['electric current', 'current', 'charge', 'coulomb', 'ampere', 'conventional current', 'rate of flow', 'i = q/t', 'barqi ro', 'current kya hai']
  },
  {
    id: 'pctb-10-phy-ch14-02',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 14,
    chapterTitle: 'Current Electricity',
    section: '14.2 Potential Difference & Electromotive Force (e.m.f)',
    pageFrom: 93,
    pageTo: 94,
    sourceType: 'textbook',
    language: 'en',
    content: `Potential difference (V) between two points in a circuit is the amount of energy dissipated as unit charge passes through that component: V = W / Q. The SI unit of potential difference is Volt (V). One volt is defined as the potential difference between two points if one joule of energy is transferred for one coulomb of charge. Electromotive force (e.m.f) is the total energy supplied by a source (like a battery) in driving one unit of positive charge through the complete circuit: E = W / Q. Both e.m.f and potential difference are measured in volts.`,
    contentHash: 'hash-phy-14-2',
    keywords: ['potential difference', 'electromotive force', 'emf', 'e.m.f', 'volt', 'voltage', 'joule per coulomb', 'battery', 'voltage difference']
  },
  {
    id: 'pctb-10-phy-ch14-03',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 14,
    chapterTitle: 'Current Electricity',
    section: "14.3 Ohm's Law and Resistance",
    pageFrom: 95,
    pageTo: 97,
    sourceType: 'textbook',
    language: 'en',
    content: `Ohm's Law states that the current (I) passing through a conductor is directly proportional to the potential difference (V) applied across its ends, provided the temperature and the physical state of the conductor do not change. Mathematically: V ∝ I or V = IR, where R is the constant of proportionality known as the resistance of the conductor. The SI unit of resistance is Ohm (Ω). One Ohm is defined as the resistance of a conductor when a potential difference of one volt applied across its ends produces a current of one ampere. Conductors that obey Ohm's law are called ohmic conductors (e.g. metals), while those that do not obey it are non-ohmic conductors (e.g. filament bulb, thermistor).`,
    contentHash: 'hash-phy-14-3',
    keywords: ["ohm's law", 'ohms law', 'ohm', 'resistance', 'v = ir', 'ohmic conductor', 'non-ohmic', 'temperature constant', 'ohm ka qanoon', 'resistor', 'voltage proportional to current']
  },
  {
    id: 'pctb-10-phy-ch14-04',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 14,
    chapterTitle: 'Current Electricity',
    section: '14.4 Factors Affecting Resistance & Specific Resistance',
    pageFrom: 98,
    pageTo: 99,
    sourceType: 'textbook',
    language: 'en',
    content: `The resistance of a conductor depends on four main factors: 1. Length of the conductor (Resistance is directly proportional to length, R ∝ L). 2. Area of cross-section (Resistance is inversely proportional to cross-sectional area, R ∝ 1/A). 3. Nature of the material. 4. Temperature. Combining these relations: R = ρ (L / A), where ρ (rho) is the specific resistance or resistivity of the material. The SI unit of resistivity is Ohm-meter (Ω·m).`,
    contentHash: 'hash-phy-14-4',
    keywords: ['factors affecting resistance', 'specific resistance', 'resistivity', 'rho', 'length', 'area of cross section', 'r = rho l / a', 'ohm meter']
  },
  {
    id: 'pctb-10-phy-ch14-05',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 14,
    chapterTitle: 'Current Electricity',
    section: "14.6 Joule's Law and Electrical Energy",
    pageFrom: 102,
    pageTo: 104,
    sourceType: 'textbook',
    language: 'en',
    content: `Joule's Law states that the amount of heat (H or W) generated in a conductor is directly proportional to the square of current (I^2), resistance (R), and time (t) for which current flows: W = I^2 · R · t. Also expressed as W = V · I · t or W = (V^2 / R) · t. Electric power P is defined as the rate at which electrical energy is transferred: P = W / t = I · V = I^2 · R = V^2 / R. The unit of electric power is Watt (W). The commercial unit of electrical energy is Kilowatt-hour (kWh), where 1 kWh = 1000 W × 3600 s = 3.6 × 10^6 Joules = 3.6 MJ.`,
    contentHash: 'hash-phy-14-5',
    keywords: ["joule's law", 'joules law', 'joule', 'heat generated', 'w = i^2 r t', 'electric power', 'watt', 'kilowatt hour', 'kwh', '3.6 mj', 'joule ka qanoon']
  },
  {
    id: 'pctb-10-phy-ch15-01',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 15,
    chapterTitle: 'Electromagnetism',
    section: '15.1 Magnetic Effects of Steady Current',
    pageFrom: 115,
    pageTo: 117,
    sourceType: 'textbook',
    language: 'en',
    content: `Hans Christian Oersted discovered in 1820 that an electric current passing through a conductor produces a magnetic field around it. The direction of the magnetic field lines around a current-carrying wire is determined by the Right Hand Grip Rule: Grasp the wire with your right hand with the thumb pointing in the direction of the conventional current; your curled fingers will indicate the direction of magnetic lines of force. A solenoid is a long coil of wire consisting of many closely spaced turns; when current passes through it, it behaves like a bar magnet with North and South poles.`,
    contentHash: 'hash-phy-15-1',
    keywords: ['magnetic effect of current', 'electromagnetism', 'oersted', 'right hand grip rule', 'solenoid', 'magnetic field lines', 'bar magnet']
  },
  {
    id: 'pctb-10-phy-ch15-02',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 15,
    chapterTitle: 'Electromagnetism',
    section: '15.4 Electromagnetic Induction & Faraday’s Law',
    pageFrom: 122,
    pageTo: 124,
    sourceType: 'textbook',
    language: 'en',
    content: `Electromagnetic induction is the phenomenon of producing an induced electromotive force (e.m.f) and induced current in a closed loop whenever there is a change in magnetic flux linked with the loop. Faraday's Law of Electromagnetic Induction states that the magnitude of induced e.m.f in a circuit is directly proportional to the rate of change of magnetic flux through the circuit: Induced e.m.f = -N (ΔΦ / Δt). Lenz's Law states that the direction of an induced current is always such that it opposes the change or cause that produces it (signified by the negative sign in Faraday's equation), in accordance with the law of conservation of energy.`,
    contentHash: 'hash-phy-15-2',
    keywords: ['electromagnetic induction', "faraday's law", "lenz's law", 'induced emf', 'induced current', 'magnetic flux', 'rate of change of flux']
  },
  {
    id: 'pctb-10-phy-ch15-03',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 15,
    chapterTitle: 'Electromagnetism',
    section: '15.6 Transformer',
    pageFrom: 128,
    pageTo: 130,
    sourceType: 'textbook',
    language: 'en',
    content: `A transformer is an electrical device used to increase (step-up) or decrease (step-down) alternating voltage (AC voltage) based on mutual induction between two coils. It consists of a primary coil (Np turns) and secondary coil (Ns turns) wound on a laminated iron core. The transformer equation is: Vs / Vp = Ns / Np = Ip / Is (for an ideal transformer where input power = output power). In a Step-Up Transformer, Ns > Np and Vs > Vp. In a Step-Down Transformer, Ns < Np and Vs < Vp. Transformers do not work on direct current (DC) because DC does not produce a changing magnetic flux.`,
    contentHash: 'hash-phy-15-3',
    keywords: ['transformer', 'step up transformer', 'step down transformer', 'mutual induction', 'vs/vp = ns/np', 'primary coil', 'secondary coil', 'alternating voltage']
  },
  {
    id: 'pctb-10-phy-ch10-01',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 10,
    chapterTitle: 'Simple Harmonic Motion and Waves',
    section: '10.1 Simple Harmonic Motion (SHM)',
    pageFrom: 1,
    pageTo: 4,
    sourceType: 'textbook',
    language: 'en',
    content: `Simple Harmonic Motion (SHM) occurs when the net restoring force is directly proportional to the displacement from the mean position and is always directed towards the mean position: a ∝ -x. Examples include mass attached to a spring, simple pendulum, and ball and bowl system. For a simple pendulum of length L in gravitational field g, time period T = 2π √(L / g). The time period of a simple pendulum is independent of mass and amplitude (for small angles). Frequency f = 1 / T.`,
    contentHash: 'hash-phy-10-1',
    keywords: ['simple harmonic motion', 'shm', 'simple pendulum', 'time period', 't = 2pi sqrt(l/g)', 'restoring force', 'mass spring system']
  },
  {
    id: 'pctb-10-phy-ch18-01',
    board: 'PCTB',
    classLevel: 10,
    subject: 'physics',
    chapterNo: 18,
    chapterTitle: 'Atomic and Nuclear Physics',
    section: '18.3 Natural Radioactivity and Half-Life',
    pageFrom: 175,
    pageTo: 178,
    sourceType: 'textbook',
    language: 'en',
    content: `Radioactivity is the spontaneous emission of radiations (alpha particles, beta particles, and gamma rays) by unstable atomic nuclei. Half-life (T_1/2) of a radioactive element is defined as the time period during which half of the radioactive atoms decay into daughter elements: N = N0 (1/2)^t. For example, the half-life of Radium-226 is 1620 years, and Carbon-14 is 5730 years. Half-life is independent of physical and chemical conditions like temperature, pressure, or chemical combination.`,
    contentHash: 'hash-phy-18-1',
    keywords: ['radioactivity', 'half life', 'half-life', 'alpha decay', 'beta decay', 'gamma ray', 'spontaneous emission', 'n = n0(1/2)^t']
  }
];

export const CHAPTER_DIRECTORY = [
  { chapterNo: 10, chapterTitle: 'Simple Harmonic Motion and Waves', subject: 'physics' },
  { chapterNo: 11, chapterTitle: 'Sound', subject: 'physics' },
  { chapterNo: 12, chapterTitle: 'Geometrical Optics', subject: 'physics' },
  { chapterNo: 13, chapterTitle: 'Electrostatics', subject: 'physics' },
  { chapterNo: 14, chapterTitle: 'Current Electricity', subject: 'physics' },
  { chapterNo: 15, chapterTitle: 'Electromagnetism', subject: 'physics' },
  { chapterNo: 16, chapterTitle: 'Basic Electronics', subject: 'physics' },
  { chapterNo: 17, chapterTitle: 'Information and Communication Technology', subject: 'physics' },
  { chapterNo: 18, chapterTitle: 'Atomic and Nuclear Physics', subject: 'physics' }
];
