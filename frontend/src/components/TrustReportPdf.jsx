// The Trust Report as a real PDF file, drawn with @react-pdf/renderer.
// Loaded on demand (see useTrustReport) so the library stays out of the main bundle.
import { cloneElement } from 'react'
import { Document, Page, View, Text, Svg, Path, Circle, Font, StyleSheet, pdf } from '@react-pdf/renderer'
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url'
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff?url'
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url'
import { DEMO_TODAY, TOPICS } from '../fixtures'
import { documentById } from '../lib/library'
import { formatDate } from '../lib/freshness'
import { scenarioById } from '../lib/pipeline'
import { BACKEND } from '../lib/backend'
import { CHECKS, CLAIM_STATUS, CHECK_STATUS, METHOD_LABEL, bandFor } from '../lib/status'
import { retrievedOf, freshnessTrace, dependencyTrace, provenance, sectionOf } from '../lib/trace'

Font.register({
  family: 'Inter',
  fonts: [
    { src: inter400, fontWeight: 400 },
    { src: inter500, fontWeight: 500 },
    { src: inter600, fontWeight: 600 },
  ],
})
Font.registerHyphenationCallback((word) => [word])

// The light theme from index.css; a PDF can't read CSS variables.
const C = {
  ink: '#171718',
  carbon: '#25282b',
  smoke: '#63666b',
  frost: '#e5e7eb',
  bone: '#f5f5f7',
  tone: {
    verified: { text: '#1f7a4d', surface: '#ebf5ef' },
    caution: { text: '#b06c00', surface: '#fdf4e6' },
    unsupported: { text: '#a3243b', surface: '#fbedef' },
    unknown: { text: '#7c7e83', surface: '#f5f5f7' },
  },
}

// Lucide glyphs (24px grid, 2px stroke), so every status keeps an icon in the file.
const GLYPHS = {
  check: [<Circle key="c" cx="12" cy="12" r="10" />, <Path key="p" d="m9 12 2 2 4-4" />],
  x: [<Circle key="c" cx="12" cy="12" r="10" />, <Path key="p" d="m15 9-6 6M9 9l6 6" />],
  alert: [<Path key="t" d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />, <Path key="p" d="M12 9v4M12 17h.01" />],
  slash: [<Circle key="c" cx="12" cy="12" r="10" />, <Path key="p" d="M9 15 15 9" />],
  clock: [<Circle key="c" cx="12" cy="12" r="10" />, <Path key="p" d="M12 6v6l4 2" />],
  compare: [<Circle key="a" cx="5" cy="6" r="3" />, <Circle key="b" cx="19" cy="18" r="3" />, <Path key="p" d="M12 6h5a2 2 0 0 1 2 2v7M12 18H7a2 2 0 0 1-2-2V9" />],
  layers: [<Path key="p" d="m12 2 10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5" />],
}
const CLAIM_GLYPH = { supported: 'check', unsupported: 'x', conflicting: 'compare', stale: 'clock', 'off-intent': 'alert', 'no-source': 'slash' }
const CHECK_GLYPH = { pass: 'check', warning: 'alert', fail: 'x', na: 'slash', running: 'slash', queued: 'slash' }
const TONE_GLYPH = { verified: 'check', caution: 'alert', unsupported: 'x', unknown: 'slash' }

const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 10, color: C.ink, paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, lineHeight: 1.45 },
  eyebrow: { fontSize: 7.5, fontWeight: 500, letterSpacing: 0.6, textTransform: 'uppercase', color: C.smoke },
  h1: { fontSize: 17, fontWeight: 600, marginTop: 6, lineHeight: 1.3 },
  h2: { fontSize: 13, fontWeight: 600, marginBottom: 6 },
  meta: { fontSize: 9, color: C.smoke, marginTop: 3 },
  body: { fontSize: 10, color: C.carbon },
  section: { marginTop: 18 },
  notice: { marginTop: 12, backgroundColor: C.bone, borderRadius: 12, padding: 10, fontSize: 9, color: C.carbon },
  quote: { marginTop: 4, backgroundColor: C.bone, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10, fontSize: 9.5, color: C.ink },
  card: { marginTop: 14, borderWidth: 1, borderColor: C.frost, borderRadius: 16, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  footer: { position: 'absolute', bottom: 24, left: 44, right: 44, fontSize: 8, color: C.smoke },
})

function Icon({ name, color, size = 9 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* react-pdf doesn't inherit paint from <Svg>, so each shape carries its own. */}
      {GLYPHS[name].map((el) => cloneElement(el, { fill: 'none', stroke: color, strokeWidth: 2.25, strokeLinecap: 'round', strokeLinejoin: 'round' }))}
    </Svg>
  )
}

/** Icon + uppercase label in a status tone, on its surface tint. Never colour alone. */
function Pill({ tone, glyph, label }) {
  const t = C.tone[tone]
  return (
    <View style={[s.row, { alignSelf: 'flex-start', backgroundColor: t.surface, borderWidth: 1, borderColor: t.text, borderRadius: 12, paddingVertical: 2, paddingHorizontal: 6 }]}>
      <Icon name={glyph} color={t.text} size={8} />
      <Text style={{ marginLeft: 3, fontSize: 7.5, lineHeight: 1, paddingTop: 1, fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase', color: t.text }}>{label}</Text>
    </View>
  )
}

const ClaimPill = ({ status }) => <Pill tone={CLAIM_STATUS[status].tone} glyph={CLAIM_GLYPH[status]} label={CLAIM_STATUS[status].label} />

function Score({ score }) {
  const band = bandFor(score)
  return <Pill tone={band.status} glyph={TONE_GLYPH[band.status]} label={score == null ? 'Not scored' : `${score} / 100 · ${band.label}`} />
}

const ordered = (claims) => [...claims].sort((x, y) => x.start - y.start)
const docName = (id) => `${documentById(id).title} (${id} ${documentById(id).version})`

function Answer({ text, claims }) {
  const parts = []
  let cursor = 0
  claims.forEach((c, i) => {
    if (c.start > cursor) parts.push(<Text key={`t${i}`}>{text.slice(cursor, c.start)}</Text>)
    const t = C.tone[CLAIM_STATUS[c.status].tone]
    parts.push(
      <Text key={c.id} style={{ backgroundColor: c.status === 'supported' ? undefined : t.surface, textDecoration: 'underline', textDecorationColor: t.text }}>
        {text.slice(c.start, c.end)}
      </Text>,
      <Text key={`${c.id}n`} style={{ fontSize: 7.5, fontWeight: 600, color: t.text }}>
        {` [${i + 1}]`}
      </Text>,
    )
    cursor = c.end
  })
  if (cursor < text.length) parts.push(<Text key="end">{text.slice(cursor)}</Text>)
  return <Text style={{ fontSize: 10.5, color: C.ink, lineHeight: 1.6 }}>{parts}</Text>
}

function Passage({ label, p, a }) {
  const d = documentById(p.docId)
  const sec = sectionOf(p.docId, p.section)
  const pv = provenance(p.docId, a)
  const by = [pv.cited && 'cited by the agent', pv.retrieved && 'found by the verifier'].filter(Boolean).join(' · ')
  return (
    <View style={{ marginTop: 10 }} wrap={false}>
      <Text style={s.eyebrow}>{label}</Text>
      <Text style={{ marginTop: 3, fontSize: 10, fontWeight: 600 }}>{d.title}</Text>
      <Text style={{ fontSize: 8.5, color: C.smoke }}>
        {p.docId} · {d.version} · Section {p.section}
        {sec ? ` · ${sec.heading}` : ''}
        {by ? ` · ${by}` : ''}
      </Text>
      <Text style={s.quote}>“{p.passage}”</Text>
    </View>
  )
}

function ClaimCard({ c, n, a }) {
  const fr = c.source ? freshnessTrace(c.source.docId) : null
  const dep = dependencyTrace(c, a)
  const search = !c.source && (a.result.search ?? scenarioById(a.scenarioId).verification.search)
  return (
    <View style={s.card} wrap={false}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 12, fontWeight: 600 }}>Claim {n}</Text>
        <ClaimPill status={c.status} />
      </View>
      <Text style={{ marginTop: 6, fontSize: 10.5, fontWeight: 500 }}>“{a.text.slice(c.start, c.end)}”</Text>
      <Text style={[s.body, { marginTop: 4 }]}>
        <Text style={{ fontWeight: 600, color: C.ink }}>Why: </Text>
        {c.reason}
      </Text>
      {c.source && <Passage label="Source passage" p={c.source} a={a} />}
      {c.counter && <Passage label="Contradicting passage" p={c.counter} a={a} />}
      {search && (
        <View style={{ marginTop: 10 }}>
          <Text style={s.eyebrow}>Retrieval record</Text>
          <Text style={[s.body, { marginTop: 3 }]}>
            Searched {search.documentsSearched} approved documents for “{search.query}”. Best match scored {search.topMatch.toFixed(2)}, below the {search.threshold.toFixed(2)} relevance threshold, so no passage was used.
          </Text>
        </View>
      )}
      {fr && (
        <View style={[s.row, { marginTop: 10, flexWrap: 'wrap' }]}>
          <Pill tone={fr.tone} glyph={TONE_GLYPH[fr.tone]} label={fr.label} />
          <Text style={[s.body, { marginLeft: 6, fontSize: 9 }]}>
            Ratified {formatDate(fr.d.updated)} · {fr.pct}% of its {fr.d.reviewCycleMonths}-month review cycle
          </Text>
        </View>
      )}
      {c.source && (
        <View style={[s.row, { marginTop: 6, flexWrap: 'wrap' }]}>
          <Pill tone={dep.tone} glyph={c.counter ? 'compare' : 'layers'} label={dep.label} />
          <Text style={[s.body, { marginLeft: 6, fontSize: 9 }]}>{dep.text}</Text>
        </View>
      )}
    </View>
  )
}

function TrustReportDocument({ a }) {
  const sc = scenarioById(a.scenarioId)
  const claims = ordered(a.result.claims)
  const retrieved = retrievedOf(a)
  return (
    <Document title={`Trust Report · ${a.question}`} author="Assessment AI (prototype)" subject="Synthetic data only. Not a bank record.">
      <Page size="A4" style={s.page}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: C.frost, paddingBottom: 12 }]}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.eyebrow}>Assessment AI · Trust Report</Text>
            <Text style={s.h1}>“{a.question}”</Text>
            <Text style={s.meta}>{[a.ref, TOPICS[sc.topic]?.name, `Report date ${formatDate(DEMO_TODAY)}`].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text style={{ fontSize: 8, color: C.carbon, borderWidth: 1, borderColor: C.frost, borderRadius: 12, paddingVertical: 3, paddingHorizontal: 7 }}>Prototype · synthetic data only</Text>
        </View>

        <Text style={s.notice}>Generated by a scripted prototype for the OCBC × NYP Ignite Innovation Challenge. Every policy document, answer and verdict in this report is synthetic. It is not a bank record.</Text>

        <View style={s.section}>
          <Text style={s.h2}>Verdict</Text>
          <Score score={a.result.score} />
          <Text style={[s.body, { marginTop: 6 }]}>{a.result.explanation}</Text>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>The answer, with each claim numbered</Text>
          <Answer text={a.text} claims={claims} />
          <View style={{ marginTop: 8 }}>
            {claims.map((c, i) => (
              <View key={c.id} style={[s.row, { marginTop: 3 }]}>
                <Text style={{ width: 22, fontSize: 9, fontWeight: 600 }}>[{i + 1}]</Text>
                <ClaimPill status={c.status} />
              </View>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>How the answer was reached</Text>
          <Text style={s.body}>
            <Text style={{ fontWeight: 600, color: C.ink }}>1. Question asked. </Text>“{a.question}”
          </Text>
          <Text style={[s.body, { marginTop: 4 }]}>
            <Text style={{ fontWeight: 600, color: C.ink }}>2. The answering agent cited: </Text>
            {a.citations.length ? a.citations.map(docName).join('; ') : 'nothing.'}
          </Text>
          <Text style={[s.body, { marginTop: 4 }]}>
            <Text style={{ fontWeight: 600, color: C.ink }}>3. Assessment AI retrieved independently: </Text>
            {retrieved.length ? retrieved.map(docName).join('; ') : 'nothing.'}
          </Text>
          <Text style={[s.body, { marginTop: 4, fontWeight: 600, color: C.ink }]}>4. Six checks ran on the answer:</Text>
          {CHECKS.map((meta, i) => {
            const ch = a.result.checks.find((x) => x.id === meta.id) ?? a.result.checks[i]
            const st = CHECK_STATUS[ch.status]
            return (
              <View key={meta.id} style={[s.row, { borderBottomWidth: 1, borderBottomColor: C.frost, paddingVertical: 5, alignItems: 'flex-start' }]} wrap={false}>
                <View style={{ width: 150 }}>
                  <Text style={{ fontSize: 9.5, fontWeight: 500 }}>{meta.name}</Text>
                  <Text style={{ fontSize: 7.5, color: C.smoke }}>{METHOD_LABEL[meta.method]}</Text>
                </View>
                <Text style={[s.body, { flex: 1, fontSize: 9, paddingRight: 8 }]}>{ch.short ?? ch.summary}</Text>
                <Pill tone={st.tone} glyph={CHECK_GLYPH[ch.status]} label={st.label} />
              </View>
            )
          })}
          <Text style={[s.body, { marginTop: 6 }]}>
            <Text style={{ fontWeight: 600, color: C.ink }}>5. Each claim was traced to a source</Text>, as below.
          </Text>
        </View>

        {claims.map((c, i) => (
          <ClaimCard key={c.id} c={c} n={i + 1} a={a} />
        ))}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>How to read this report</Text>
          <Text style={s.body}>
            {BACKEND
              ? 'Answers, claim spans and judge verdicts are scripted fixtures. Retrieval, rule checks, scores and routing are computed by the backend from the policy library.'
              : 'Answers, retrieval results and judge verdicts are scripted fixtures; rule checks and scores are computed in code from them.'}{' '}
            Every claim verdict quotes the passage it relied on. Freshness compares each document’s ratification date with its review cycle. A claim is cross-validated when the agent cited a document and the verifier found the same document on its own.
          </Text>
        </View>

        <Text style={s.footer} fixed>
          Assessment AI · Trust Report · Prototype, synthetic data only
        </Text>
      </Page>
    </Document>
  )
}

const slug = (x) => x.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

/** Build the PDF and hand it to the browser as a file download. */
export async function downloadTrustReport(a) {
  const blob = await pdf(<TrustReportDocument a={a} />).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Trust-Report-${slug(a.ref ?? a.scenarioId)}-${DEMO_TODAY}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
