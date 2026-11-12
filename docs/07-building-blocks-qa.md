# Voice AI building blocks: questions and answers

A study and meeting guide. Every answer starts with a **short answer** you can say out loud, then the detail behind it.
Open `simulator/building-blocks.html` alongside: each journey there illustrates one or more answers.

**Contents**

- A. The big picture (Q1–Q3)
- B. Getting an Airtel/Jio/landline call into the cloud (Q4–Q13)
- C. SIP explained (Q14–Q20)
- D. Twilio, and "how do we actually make calls?" (Q21–Q25)
- E. Amazon Lex: what it really does (Q26–Q31)
- F. WebSocket vs WebRTC vs webhook (Q32–Q36)
- G. Connecting Genesys Cloud and Amazon Connect (Q37–Q43)
- H. Dividing calls between the two platforms (Q44–Q48)
- I. AI voice building blocks (Q49–Q52)
- J. Security and compliance (Q53–Q54)
- K. The demo and the use case (Q55–Q58)
- Sources

---

## A. The big picture

### Q1. What are the building blocks of a voice AI contact center?

**Short answer:** Eight layers. The customer, the phone network, the phone number, the trunk that brings calls into the cloud, a security gateway, the contact-center platform, the AI, and your business systems, with people (agents) and data around them.

| # | Layer | What it does | Examples |
|---|---|---|---|
| 1 | Customer device | Makes the call | Mobile, landline, browser, app |
| 2 | Telecom operator (TSP / carrier) | Carries the call across the public phone network (PSTN) | Airtel, Jio, Vi, BSNL, Tata Communications |
| 3 | Phone number | The "address" customers dial | DID (direct number), toll-free 1800, 140/1600 series for outbound |
| 4 | SIP trunk | The digital connection that hands calls from the operator to your systems | Airtel/Tata SIP trunk, Twilio Elastic SIP Trunking |
| 5 | SBC (Session Border Controller) | Security guard + translator at the edge | AudioCodes, Ribbon, Oracle, Cisco |
| 6 | CCaaS platform | Answers, routes, queues, records, agent desktops, reporting | Genesys Cloud CX, Amazon Connect |
| 7 | AI / bot | Listens, understands, talks, decides | Amazon Lex, Connect AI agents (Nova Sonic), Genesys Agentic Virtual Agent |
| 8 | Business systems | The real answers and actions | Order system, CRM, payments |
| + | Agents | Humans for the hard cases | Softphones (WebRTC) in the browser |
| + | Data & analytics | Reporting, QA, compliance | Contact records, recordings, dashboards |

The demo (`simulator/building-blocks.html`, journey 1) walks through layers 1 to 8 in order.

### Q2. What is the difference between a telecom operator, CPaaS, CCaaS, UCaaS and an AI bot?

**Short answer:** The operator moves calls. CPaaS gives developers building blocks (APIs). CCaaS is a ready-made contact center. UCaaS is office phones and meetings. The AI bot is one component that plugs into a CCaaS.

| Category | Analogy | What you get | Examples |
|---|---|---|---|
| Telecom operator / TSP | The road network | Phone numbers, call delivery, SIP trunks | Airtel, Tata, Jio |
| CPaaS (Communications Platform as a Service) | Bricks and cement | APIs to add calling/SMS/WhatsApp to your own apps; SIP trunking | Twilio, Vonage, Sinch, Plivo, Exotel |
| CCaaS (Contact Center as a Service) | A finished building | IVR, routing, queues, agent desktop, recording, WFM, analytics | Genesys Cloud CX, Amazon Connect, NICE CXone, Five9, Twilio Flex |
| UCaaS (Unified Communications) | The office's internal phones | Employee calling, meetings, chat | Microsoft Teams, Zoom Phone, Webex |
| Conversational AI | A receptionist hired into the building | Speech understanding and conversation | Amazon Lex, Nova Sonic, Dialogflow, Kore.ai, PolyAI |

A clean one-liner: CPaaS is a set of APIs you plug into your own applications; CCaaS is a ready-made application with contact-center features built in.

### Q3. Where do SIP, RTP, WebSocket, WebRTC and webhooks each fit?

**Short answer:** SIP sets up phone calls between telephony systems. RTP carries the voice. WebRTC is real-time voice for browsers and apps. A WebSocket is a long-lived two-way pipe between servers (used to stream call audio to an AI). A webhook is a single "here is an event, give me an answer" HTTP call (used for data lookups).

| Hop in our design | Protocol |
|---|---|
| Airtel → our SIP trunk/SBC → Genesys | SIP (signalling) + RTP/SRTP (voice) |
| Connect → SBC → Genesys (cross-platform transfer) | SIP + RTP/SRTP, with a UUI header |
| Genesys → our own AI bot (Audio Connector) | WebSocket (wss://) |
| Website "Call us" button → Amazon Connect | WebRTC |
| Agent softphone in the browser | WebRTC |
| Bot → order system; Genesys → context lookup | Webhook / HTTPS API |

Details in section F.

---

## B. Getting an Airtel / Jio / landline call into the cloud

### Q4. Step by step, how does a call from an Airtel mobile reach Genesys or Amazon Connect?

**Short answer:** The customer dials our number, and Airtel's network finds the operator that owns that number. That operator turns the call into SIP and sends it down our SIP trunk to our SBC, which passes it to Genesys. Amazon Connect is different: it only takes calls on numbers hosted by AWS (or its telephony partners).

**Genesys path (bring your own carrier):**
1. The customer dials `1800-xxx-xxxx` on Airtel.
2. The phone network routes the call to the operator that "hosts" that number. That is our telecom provider (e.g. Tata or Airtel Business).
3. Our provider converts the call to **SIP** and sends a `SIP INVITE` down our **SIP trunk** to our **SBC**.
4. The SBC checks the source, cleans up the headers, encrypts (TLS/SRTP) and forwards the INVITE to the **Genesys BYOC trunk**.
5. Genesys matches the dialled number to an **Architect flow**, answers (`200 OK`), and voice flows as **RTP/SRTP** packets.
6. The flow plays prompts, calls the AI bot, queues to agents, and so on.

**Amazon Connect path:**
1–2. Same start.
3. The number is **claimed in Amazon Connect** (AWS provides it through its telephony network, or through a partner for countries AWS doesn't cover directly).
4. The call lands straight in a **Connect contact flow**. There is no customer-owned SIP trunk on the way in.

### Q5. What is a phone number, technically? Who owns it?

**Short answer:** A number is a routing address leased from a licensed operator. Whoever holds the number decides where its calls go.

- **DID (Direct Inward Dialling):** a normal geographic or mobile-style number pointing at your trunk.
- **Toll-free (1800 in India):** the business pays for the call; the operator maps it to a DID/trunk behind the scenes.
- **Outbound "caller ID" (CLI):** the number shown when you call customers. In India, promotional calls must come from **140-series** numbers and BFSI service/transactional calls from **1600-series**.
- **Porting** moves a number from one operator to another. **Forwarding** keeps the number where it is and redirects calls.

### Q6. What exactly is a SIP trunk? Is it a physical line?

**Short answer:** A SIP trunk is a logical connection, not a physical cable. It's an agreement and configuration that lets an operator send and receive calls to your systems as SIP over an IP network.

It replaces old **PRI/E1 lines** (30 voice channels per physical circuit). A SIP trunk runs over an IP link: the internet, MPLS, or a leased line (ILL). Capacity is set in concurrent calls ("channels") and can usually grow without new hardware. **Elastic** SIP trunks (e.g. Twilio, Sinch) scale on demand.

**India:** SIP trunking is legal when delivered by a DoT-licensed operator. Industry guides note that domestic SIP trunking is typically delivered over dedicated circuits rather than the public internet. Confirm the exact arrangement with your provider.

### Q7. What is an SBC and do we need one?

**Short answer:** A Session Border Controller is a firewall built for phone calls. It sits where your trunk meets your platforms and handles security, routing, header fixes and encryption. With an operator trunk into Genesys or a cross-platform transfer, yes, you need one. If Amazon Connect hosts the numbers, you don't need one for inbound.

What an SBC does:
- **Security:** only accepts SIP from known IPs, hides internal topology, stops toll fraud and SIP floods.
- **Normalisation:** different vendors format SIP slightly differently; the SBC rewrites headers (e.g. moves context into `User-to-User`).
- **Routing:** picks the destination by dialled number, caller number, time, or percentage (this is how you split calls; see Q44).
- **Media:** encrypts (TLS/SRTP), and can transcode codecs or record (SIPREC).
- Deployed as an appliance, a VM in AWS (e.g. in the Mumbai region), or as a managed service from the operator.

### Q8. What are the ways to connect telephony to Genesys Cloud?

**Short answer:** Three options. Genesys provides the numbers itself (Genesys Cloud Voice), you bring your own carrier straight to Genesys's cloud (BYOC Cloud), or you bring it to Genesys Edge devices on your premises (BYOC Premises).

| Option | How | When |
|---|---|---|
| Genesys Cloud Voice | Genesys is your carrier | Simplest, where available |
| **BYOC Cloud** | Your operator's SIP trunk (often via your SBC) connects to Genesys's cloud SIP servers in AWS | Most common for enterprises; keeps your carrier contracts |
| BYOC Premises | Genesys Edge appliances on your site connect to your local trunks | Regulatory/local-breakout needs, existing on-prem trunks |

- BYOC Cloud uses **TLS 1.2 on port 5061** with **SRTP** for encrypted media. Genesys does not support mutual TLS on these trunks and expects the TLS handshake to finish within 500 ms.
- In 2026 Genesys introduced a **Dynamic Cloud Voice platform** for BYOC with new SIP IP addresses, so old and new trunks can coexist during migration.
- **India:** Genesys's India guidance says customers connect through an Indian telephony service provider (Tata, Airtel, etc.), with Genesys Cloud Voice planned for the future. Under India's rules, call detail records (CDRs) must include the handling agent and be kept in India with an IST timestamp.

### Q9. What are the ways to connect telephony to Amazon Connect?

**Short answer:** Amazon Connect manages telephony for you. You claim or port numbers inside Connect, or get them through an AWS telephony partner. It does not accept your own SIP trunk the way Genesys BYOC does.

- AWS says Connect offers DID and toll-free numbers in **158 countries**, national outbound numbers in **72 countries**, and international dialling from supported regions.
- Where AWS lacks coverage, partners such as **AVOXI** provide numbers through shared SIP trunking into Connect.
- Telecom vendors state plainly that "Amazon Connect does not support BYOC as a platform feature". The workaround is to **forward calls** from another provider's number to a Connect-claimed number.
- **India:** Connect runs in the **Asia Pacific (Mumbai)** region, but Indian phone numbers have been obtained through an AWS Support "special phone number request" or a carrier partner, and outbound availability has been limited. Check the current Amazon Connect telecoms coverage document before committing.

### Q10. What is special about India?

**Short answer:** Calls must come through a licensed Indian operator, domestic VoIP-to-phone-network dial-out is restricted, call records must stay in India, and outbound calls must use the right number series and respect DND. Contact centers no longer need OSP registration.

- **Licensed providers only:** only DoT-licensed operators may provide PSTN connectivity / SIP trunking (Unified Licence framework).
- **OSP rules liberalised (2020–2021):** OSP registration is no longer required. Cloud telephony, hosted EPABX and work-from-home agents are allowed, with security safeguards still enforced.
- **VoIP dial-out:** industry guidance (2026) says domestic VoIP-to-PSTN dial-out to Indian mobiles/landlines remains prohibited, and SIP trunking is limited to dedicated circuits. In practice, outbound to Indian numbers goes through a licensed operator's trunk, not an internet VoIP route.
- **CDRs:** must be retained in India with IST timestamps and the handling agent, available to DoT on request.
- **Outbound number series:** promotional calls on **140-series**; BFSI service/transactional calls on **1600-series**. Operators are told not to block 1600 calls, and DND preferences govern promotional calls.
- **Upcoming change:** DoT is finalising authorisation rules under the **Telecom Act 2023**. Watch for SIP-over-internet liberalisation.
- Always confirm the design with legal counsel and your TSP. Genesys's own India document says the same.

### Q11. Can we keep our existing phone numbers?

**Short answer:** Usually yes. With Genesys you keep the number with your operator and point its SIP trunk at Genesys (no port needed). With Connect you either port the number to AWS (where supported) or forward it to a Connect number.

| Approach | What changes | Risk |
|---|---|---|
| Re-point the trunk (Genesys BYOC) | Operator sends the same number's calls to your SBC/Genesys | Low; reversible |
| Port the number | Number moves to the new provider | Cut-over day risk; paperwork |
| Forward the number | Old provider forwards to a new number | Extra leg, extra cost, caller ID handling |

### Q12. What is the fastest way to run a POC with a real call?

**Short answer:** Start where the numbers are easiest. Claim an Amazon Connect test number (e.g. US or UK) or use a Genesys test DID, and prove the flow, bot and transfer. Then do the India telephony (TSP trunk + SBC) as its own workstream.

The `docs/04` and `docs/05` guides do exactly this. The telephony layer is independent of the AI layer: once the operator delivers a SIP call to the platform, everything above it works the same.

### Q13. How does the voice itself travel, and how good is it?

**Short answer:** As small RTP packets every 20 ms. Phone networks use narrowband G.711 (8 kHz). Browsers use wideband Opus via WebRTC. Good calls need low latency (under about 150 ms one way), low jitter and little packet loss.

- **G.711 (PCMU/PCMA):** 64 kbps, 8 kHz, the universal phone codec. It's what Genesys Audio Connector streams, and what Lex's recogniser is trained on.
- **Opus:** adaptive wideband codec used by WebRTC; better quality for web/app callers.
- **Transcoding** (converting codecs) costs CPU and a little quality, so keep one codec end to end where possible.
- Jitter buffers smooth uneven arrival. Packet loss above a few percent sounds robotic.

---

## C. SIP explained

### Q14. What is SIP, in simple terms?

**Short answer:** SIP (Session Initiation Protocol) is the language phone systems use to say: "I have a call for this number", "it's ringing", "answered", "transfer it there", "hang up". It does **not** carry the voice. RTP does that.

Analogy: SIP is the conversation between two receptionists arranging a meeting. RTP is the meeting itself.

### Q15. What happens, message by message, in a SIP call?

**Short answer:** INVITE → 100 Trying → 180 Ringing → 200 OK → ACK → voice flows (RTP) → BYE → 200 OK.

```
Operator (Airtel/Tata)            SBC / Genesys
   | INVITE (to: 1800..., SDP: G.711, IP:port) --> |
   | <-- 100 Trying                                |
   | <-- 180 Ringing                               |
   | <-- 200 OK (SDP: agreed codec, media IP:port) |
   | ACK -->                                       |
   |<========== RTP / SRTP voice both ways ======> |
   | BYE -->            (or the other side)        |
   | <-- 200 OK                                    |
```

- **SDP** (inside INVITE/200 OK) negotiates codec and media addresses.
- Common failures: `404` number not found, `486` busy, `403` forbidden (IP not allowed), `503` service unavailable, `408` timeout.
- **OPTIONS** messages are "are you alive?" pings between trunks and SBCs.

### Q16. What is the difference between SIP and RTP?

**Short answer:** SIP is the control channel (setup, transfer, teardown). RTP is the media channel (the actual voice packets). They travel separately, often on different ports and even different servers.

SIP uses port 5060 (UDP/TCP) or **5061 (TLS)**. RTP uses a range of high ports. **SRTP** is encrypted RTP, with keys exchanged securely (e.g. SDES over TLS, or DTLS in WebRTC).

### Q17. How do call transfers work in SIP?

**Short answer:** Either the call is handed off with `REFER` ("please call this other place instead"), or the platform keeps the call and bridges a second leg to the new destination. Each choice changes who stays in the call and who keeps paying.

| Method | What happens | Who stays in the media path |
|---|---|---|
| **REFER (blind transfer)** | Platform tells the upstream side to call the new destination | Usually nobody: the first platform drops out |
| **Bridged / consult transfer** | Platform places a new outbound call and connects the two legs | The first platform stays in the middle (and may keep billing per minute) |
| **302 redirect** | Before answering, "go there instead" | Nobody |

This matters when moving calls between Genesys and Connect (Q39–Q42).

### Q18. What are UUI and X-headers? How do we pass context with a call?

**Short answer:** They are extra lines in the SIP INVITE that carry a small note with the call. We put a short **reference key** there (not personal data), and the receiving platform uses the key to fetch the full context from an API.

- **User-to-User (UUI, RFC 7433):** standard header, e.g. `User-to-User: 636B3D61...;encoding=hex`.
- **X-headers:** custom headers like `X-Context-Key: abc123` (support varies; SBCs can convert between them).
- **Genesys:** reads `User-To-User`, then `x-User-To-User`. It discards duplicate or conflicting UUI headers, and data that doesn't match the declared encoding fails to parse. It recommends ≤ 128 characters.
- **Amazon Connect:** can **send** UUI/custom headers on external voice transfers but does **not read** inbound SIP headers. Context coming into Connect needs an API lookup.
- Use TCP or TLS on trunks that carry big headers; large UDP packets can be fragmented and dropped.

### Q19. How is a SIP call secured?

**Short answer:** Encrypt signalling with TLS (port 5061) and voice with SRTP, only accept traffic from known IPs, and put an SBC at the edge.

Add strong IP allowlists and ACLs, toll-fraud limits on outbound (country/price caps), SIP authentication where supported, certificate management (BYOC needs public CA certs on your SBC), and private circuits (MPLS/ILL, AWS Direct Connect) for sensitive traffic.

### Q20. How do keypad presses (DTMF) work on IP calls?

**Short answer:** Usually as special RTP events (RFC 4733, previously RFC 2833) rather than actual tones. Sometimes they're sent as SIP INFO messages. Bots receive them as digits.

---

## D. Twilio, and "how do we actually make calls?"

### Q21. Where does Twilio fit? Is it a competitor of Genesys and Amazon Connect?

**Short answer:** Twilio is mainly a **CPaaS**: APIs and SIP trunking for developers. It does also sell a CCaaS product, **Twilio Flex**, which competes with Genesys and Connect. In a Genesys or Connect project, Twilio is usually either not needed or plays the **carrier/plumbing** role.

| Twilio product | Category | Relationship to Genesys / Connect |
|---|---|---|
| Programmable Voice / Messaging / WhatsApp APIs | CPaaS | Build your own call/SMS apps |
| **Elastic SIP Trunking** | Carrier-like | Can be the BYOC carrier for Genesys (Twilio publishes config guides for Genesys Cloud) |
| Media Streams / ConversationRelay | CPaaS for AI voice | Stream calls to your own AI over WebSocket |
| **Twilio Flex** | CCaaS | Direct competitor |

**India:** check Twilio's current in-country capabilities. Indian PSTN access must come from licensed operators.

### Q22. If SIP is "just a protocol", who actually makes or carries the call?

**Short answer:** The **operator** carries it across the phone network. The **platform** (Genesys/Connect) decides what to do with it. SIP is simply the language they use to talk to each other over the **trunk**.

Analogy: SIP is the courier's paperwork format. The operator is the courier company. Genesys/Connect is the office that receives and sorts parcels.

### Q23. How do outbound calls work from Genesys and Amazon Connect?

**Short answer:** The agent (or a campaign/dialler) asks the platform to call a number. The platform sends an outbound SIP INVITE with a caller ID through its trunk to the operator, and the operator rings the customer's phone.

- **Genesys:** agent click-to-dial or outbound campaigns. Calls leave through Genesys Cloud Voice or your **BYOC trunk** (your operator, your caller ID).
- **Amazon Connect:** outbound calls and **outbound campaigns** from numbers claimed in Connect, where outbound is supported for that country.
- **Caller ID** must be a number you're allowed to present. Answer rates depend heavily on recognisable, compliant caller IDs.

### Q24. What are the rules for outbound calling in India?

**Short answer:** Use a licensed operator's trunk, use 140-series numbers for promotional calls and 1600-series for BFSI service/transactional calls, respect DND and consent, and register on the operators' DLT platforms.

- 140-series is promotional only (any sector), with consent/DND rules.
- 1600-series is reserved for service and transactional calls by RBI/SEBI/IRDAI/PFRDA-regulated entities (it started with BFSI). Operators may not block 1600 calls.
- Robocalls and auto-dialler traffic follow the same split: promotional on 140, service/transactional on 160/1600. Penalties for violations can include barring every SIP/PRI trunk of the sender.
- Domestic VoIP-to-PSTN dial-out is restricted, so outbound must go through a licensed TSP trunk (Q10).

### Q25. Do we need Twilio at all?

**Short answer:** Not for a Genesys- or Connect-based design. Both already provide telephony, IVR, AI hooks and agents. Consider Twilio only if you need a programmable carrier in a specific country, custom calling apps, or a specific AI vendor that connects through Twilio.

---

## E. Amazon Lex: what it really does

### Q26. What does Amazon Lex do?

**Short answer:** Lex is a **conversation engine**. It listens (speech-to-text tuned for phone audio), understands (intent + details, called slots), runs the conversation (asks follow-ups, remembers context), calls your code (Lambda), and talks back (Polly voices).

| Lex capability | What it means | In our WISMO bot |
|---|---|---|
| ASR (speech recognition) | Turns speech into text; trained on 8 kHz telephony audio | "where's my parcel" → text |
| NLU | Maps text to an **intent** with a confidence score; extracts **slots** | intent `OrderHelp`, slot `OrderNumber=10021` |
| Dialog management | Prompts for missing slots, confirms, retries, handles fallback | "What's your order number?" |
| Context management | Remembers what's been said across turns | Knows the ZIP answer belongs to the order |
| Lambda code hooks | Runs your business logic each turn | `lambda/index.js` (the brain) |
| Polly (text-to-speech) | Speaks replies in natural neural voices | Bot's voice on the phone |
| Versions and aliases | Safe releases (test vs prod) | `TestBotAlias` → `ProdAlias` |
| Analytics / test workbench | See transcription, intent and slot accuracy | Tune utterances |
| Native integration | Built into Amazon Connect; available in Genesys via the Lex V2 integration | `docs/04`, `docs/05` |

### Q27. Is Lex "just a bot"? How is it different from Polly, Transcribe, Connect AI agents and Nova Sonic?

**Short answer:** Lex is the classic, structured bot engine: predictable, intent-based and easy to govern. The other services are pieces of it (Polly, Transcribe) or the newer generative approach (Connect AI agents, Nova Sonic).

| Service | Role | Analogy |
|---|---|---|
| **Polly** | Text → speech only | The voice |
| **Transcribe** | Speech → text only (also for analytics) | The ears |
| **Lex** | Ears + understanding + conversation manager (+ Polly for voice) | A trained receptionist with a script |
| **Connect AI agents (Nova Sonic)** | Generative, agentic self-service that reasons, uses tools, and can hand off at any point | A receptionist who can improvise within rules |
| **Bedrock (LLMs)** | General generative models you call from your own code | A very smart consultant you brief |
| **Genesys Agentic Virtual Agent** | Genesys's generative virtual agent | Same idea, inside Genesys |

When to pick Lex: well-defined tasks (order status, balance, appointment), strict control, PCI flows, predictable cost, and teams new to voice AI.

### Q28. What generative AI features does Lex have now?

**Short answer:** It uses LLMs to understand customers better while staying inside your bot's design (Assisted NLU and assisted slot resolution), and it can answer FAQs from your documents (QnAIntent).

- **Assisted NLU:** the LLM is used strictly as a classifier and extractor constrained by your intents and slots, not as a free-text generator. AWS reports average intent classification accuracy of 92% and slot resolution accuracy of 84%, at no extra cost on standard Lex pricing.
- **Assisted slot resolution:** the LLM fills in a slot when the native NLU can't resolve it.
- **QnAIntent:** connects a foundation model to your company knowledge (retrieval-augmented generation) for FAQ answers, including in Amazon Connect.

### Q29. How does Lex connect to Amazon Connect and to Genesys?

**Short answer:** In Connect it's a built-in flow block ("Get customer input"). In Genesys you install the Amazon Lex V2 integration, give Genesys an IAM role in your AWS account, and use the "Call Lex V2 Bot" action in Architect.

- **Connect:** add the bot to the instance; the flow passes session attributes (e.g. caller number) and branches on the returned intent.
- **Genesys:** the IAM role is scoped to your bot; the action returns the intent (and slots / session attributes); it is supported inside Genesys secure flows for PCI DSS use.
- **Same bot, both platforms:** our `lambda/index.js` serves both, so behaviour is identical.

### Q30. Lex, Connect AI agents, Genesys virtual agent, or our own bot over WebSocket: how do we choose?

| Option | Best for | Trade-off |
|---|---|---|
| Lex (structured) | First deployments, defined tasks, PCI, both platforms | Less natural for open conversation |
| Connect AI agents + Nova Sonic | Natural, generative self-service on Connect | Connect-centric; newer; region availability |
| Genesys Agentic Virtual Agent | Generative self-service while staying in Genesys | Genesys-centric licensing |
| Own bot via Audio Connector (WebSocket) | Full control, any model (Nova Sonic, others) | You build and operate the streaming service |

### Q31. Languages, costs and limits?

**Short answer:** Lex is priced per request (speech or text). Check the Lex pricing page and the supported-languages list (Indian English, Hindi and other Indian languages) for your region before committing. Lambda costs are usually tiny. Connect or Genesys per-minute charges apply on top.

---

## F. WebSocket vs WebRTC vs webhook

### Q32. What are they, in one sentence each?

- **Webhook:** "Something happened. Here's the data. Reply." One HTTPS request, one response. Like **a doorbell**.
- **WebSocket:** a long-lived, two-way connection between two programs over the internet, where either side can send at any time. Like **an open phone line between two offices**.
- **WebRTC:** a complete real-time audio/video system built into browsers and apps (codecs, encryption, NAT traversal, echo cancellation). Like **a walkie-talkie built into the browser**.

### Q33. How do they compare in detail?

| | Webhook / REST API | WebSocket | WebRTC | (SIP + RTP) |
|---|---|---|---|---|
| Purpose | Event notification / request–response | Streaming messages both ways | Real-time media for people | Telephony calls between systems |
| Connection | Opens and closes per request | Stays open for the session | Stays open for the call | Stays for the call |
| Who talks to whom | Server ↔ server | Server ↔ server (or browser ↔ server) | Browser/app ↔ media server or peer | Telephony system ↔ telephony system |
| Transport | HTTPS over TCP | TCP (TLS = `wss://`) | Mostly UDP (DTLS-SRTP), ICE/STUN/TURN | SIP over UDP/TCP/TLS; RTP over UDP |
| Carries | Small JSON | Text frames + binary (e.g. audio) | Live audio/video (Opus), data channel | Signalling + voice |
| Latency | Per request (~100s of ms) | Low, continuous | Lowest for people's media | Low |
| Typical use here | Order lookup, context fetch, allocation | Genesys Audio Connector / AudioHook; Connect A2A voice; AI speech streams | Website "Call us"; agent softphones | Operator trunks, cross-platform transfers |

### Q34. Where exactly does each one appear in our design?

- **SIP/RTP:** Airtel/Tata → SBC → Genesys; Connect → SBC → Genesys transfers (journeys 1, 2, 5, 6 in the explorer).
- **WebSocket:** Genesys **Audio Connector** streams call audio to our AI and receives the bot's audio back. **AudioHook Monitor** streams one way for analytics. Amazon Connect **A2A** two-way voice to external agents also uses `wss://` (journey 4).
- **WebRTC:** Genesys and Connect agent softphones; Amazon Connect in-app/web calling for a website "Call us" button (journey 3).
- **Webhooks/APIs:** Lex → Lambda → order API; Genesys **data actions**; Connect **Invoke Lambda** blocks (most journeys).

### Q35. Why not stream audio over webhooks, or use WebRTC between servers?

**Short answer:** Webhooks open a new connection per message, which is far too slow and heavy for audio every 20 ms. WebRTC's main strengths (getting through home NATs, coping with lossy Wi-Fi, echo cancellation) matter for people's devices, not server-to-server links inside data centers, where a WebSocket is simpler.

### Q36. What is the difference between a REST API and a webhook?

**Short answer:** Same technology (HTTPS), opposite direction. With a **REST API** you call them when you want something. With a **webhook** they call you when something happens. A Genesys data action is the flow calling an API; a Lex code hook is Lex calling your Lambda (webhook style).

---

## G. Connecting Genesys Cloud and Amazon Connect

### Q37. Why would a company run both platforms?

**Short answer:** Usually for a phased **migration**, because different business units or acquired companies chose different platforms, to use **AWS AI** with existing Genesys agents, or for **resilience and peak overflow**.

### Q38. What are all the ways to connect them?

**Short answer:** Six patterns, from "no call ever moves" to "calls move both ways". Prefer the ones near the top.

| # | Pattern | Calls cross platforms? | When |
|---|---|---|---|
| 1 | **Connect only at the AI/data layer**: Genesys uses AWS AI (Lex, Bedrock, Nova Sonic) directly | No | You want AWS AI but agents stay on Genesys |
| 2 | **Split at the edge**: different numbers / lines of business go to different platforms | No | Both platforms are live for different teams |
| 3 | **Connect → Genesys transfer** via external voice transfer → SBC → Genesys BYOC, with UUI | Yes, private SIP | Connect front door / AI; Genesys agents |
| 4 | **Genesys → Connect transfer** via a Connect phone number; context through an API | Yes, via a number | Rare; prefer 2 |
| 5 | **Shared data layer**: same CRM, same context store, same data lake | No | Always do this |
| 6 | **Analytics bridge**: SIPREC from Genesys into Connect analytics, or AudioHook to AWS | Copy only | Unified QA during migration |

### Q39. Exactly how do we transfer a call from Amazon Connect to Genesys?

**Short answer:** Connect's **external voice transfer connector** sends the call over private SIP to our SBC, which forwards it to a Genesys BYOC trunk. A short key in the UUI header lets Genesys fetch the context.

Step by step:
1. **AWS:** request a quota increase for external voice transfer connectors. The option appears in the console after approval.
2. **SBC:** deploy one (often in AWS), with SIP TLS + SRTP to both sides. Configure header normalisation so UUI arrives as `User-To-User`.
3. **Connect:** create the voice transfer connector (target type: SBC) with outbound routes.
4. **Genesys:** create a BYOC Cloud trunk to the SBC (TLS, public CA certificate) and a dedicated "handoff" number routed to a **Handoff from Connect** Architect flow.
5. **Connect flow:** on escalation, call a Lambda that saves the context and returns a key; transfer to the external system with `User-to-User: <key>;encoding=hex`; **error branch** to a Connect queue or callback.
6. **Genesys flow:** read `Call.UUIData` → data action fetches the context → set participant data (screen pop) → transfer to the right queue at raised priority → fallback queue on failure.
7. **Test the failures:** SBC down, trunk down, unknown key. The caller must always land somewhere.

**Check during design:** whether Connect stays in the media path after this transfer (and so keeps per-minute billing), and the exact flow setting used to write the UUI header in your Region.

### Q40. How do we transfer a call from Genesys to Amazon Connect?

**Short answer:** Genesys transfers the call to a phone number claimed in Connect. Since Connect doesn't read incoming SIP headers, Genesys first saves the context in a shared store keyed by the caller's number, and a Connect Lambda looks it up.

This path usually "trombones" (out through the phone network and back in), which adds a call leg, latency and cost. That's why splitting at the edge (Q44) is preferred for this direction.

### Q41. How do we keep context so the customer never repeats themselves?

**Short answer:** Pass a reference, not data. A short key travels with the call (UUI, or caller number + time window), the context lives in a shared encrypted store with a short expiry, and the receiving agent's screen pops it.

The context contains: verified yes/no, intent, order/case ID, summary, last bot turn, reason for transfer. Never put card numbers, full addresses or OTPs in headers or logs.

### Q42. What is the benefit of cross-platform transfers, and what do they cost?

| Benefits | Costs / risks |
|---|---|
| Use each platform's strengths (e.g. Connect AI, Genesys workforce tools) | Possible **double per-minute charges** while both platforms are in the call |
| Migrate gradually instead of a big-bang cut-over | **Extra latency** and more failure points (SBC, trunk, connector) |
| Resilience: overflow when one platform is busy or down | **Split reporting**: one customer journey across two systems |
| Keep existing agents and processes during change | **Context loss** if the hand-over isn't designed carefully |
| | Two admin skill sets and two vendor contracts |

### Q43. What is the optimised way to run both?

**Short answer:** Decide the platform before the call arrives, keep one platform in charge of each call, and move calls only for escalation or overflow, over private SIP, with context passed by reference.

1. **Split at the edge** (numbers/SBC) by line of business. Most calls never cross.
2. **Bring AI to the platform** instead of moving calls: Genesys can call Lex/Bedrock directly.
3. If calls must move, use **Connect → SBC → Genesys** private SIP, not the public phone network.
4. **One anchor per call:** the platform that answers owns the call until it ends or hands off completely.
5. **Shared context store + shared customer ID**, so reporting can join journeys across platforms.
6. **Monitor and test** the transfer path weekly; rarely used paths break silently.

---

## H. Dividing calls between the two platforms

### Q44. What are the methods for dividing calls?

| Method | Where it happens | How | Calls cross platforms? |
|---|---|---|---|
| **By number / line of business** | Operator | Sales number → Genesys, Support number → Connect | No |
| **By SBC rules** | SBC | Route by dialled number, caller number, time of day, or weighted percentage | No (but Connect needs a Connect number on the far side) |
| **Front door + transfer** | Platform A | A answers everything and transfers some to B | Yes, every moved call |
| **Overflow** | Platform A | Transfer to B only when A's queue is too long or A is down | Yes, only at peaks |
| **By customer segment** | Platform A (CRM lookup) | VIPs to B, others to A | Yes |
| **By geography / language** | Operator or SBC | Regional numbers to regional platforms | No |

Try them in the explorer's "Split calls" panel: it routes 100 calls and counts transfers.

### Q45. Which method is best?

**Short answer:** Split **by number at the edge** whenever you can: zero transfers, simplest reporting and cheapest. Use **SBC percentage splits** for controlled migrations, **overflow** for resilience, and **front-door transfer** only when the first platform adds real value (such as an AI bot) before handing over.

### Q46. How do we run a phased migration from one platform to the other?

**Short answer:** Move one line of business, number or percentage at a time, keep a rollback, and compare results before moving more.

1. Inventory numbers, flows, queues and integrations.
2. Rebuild flows on the target platform (vendors offer conversion tools).
3. Move **one low-risk number** first, then grow: 5% → 25% → 50% → 100% by number or SBC weight.
4. Keep the old route ready for instant rollback (one SBC or operator change).
5. Unify reporting during the overlap; historical recordings and reports don't transfer automatically.

### Q47. How does a percentage split actually work technically?

**Short answer:** Something in the path makes a weighted random choice per call: the SBC (weighted routes), Connect's "Distribute by percentage" block, or a Genesys Architect `Random()` decision. For a consistent experience, hash the caller's number so the same caller always goes the same way (`src/allocator.js` does this).

### Q48. How do we report across two platforms?

**Short answer:** Stream both platforms' contact records into one data store with a shared journey ID, then report from there.

- Connect: contact records via Kinesis, plus EventBridge events.
- Genesys: analytics APIs / EventBridge integration.
- Join on a shared key (the UUI context key, CRM case ID, or caller number + time). Measure end-to-end outcomes (resolved, repeat call, wait time) per customer journey, not per platform.

---

## I. AI voice building blocks

### Q49. What are STT, NLU, LLM, TTS and speech-to-speech?

| Term | Meaning | AWS example |
|---|---|---|
| STT / ASR | Speech → text | Transcribe, Lex |
| NLU | Text → intent + details | Lex |
| LLM | Generates/reasons with language | Bedrock models |
| TTS | Text → speech | Polly |
| Speech-to-speech | One model listens and talks directly; lower latency, more natural | Nova Sonic |

### Q50. What are the three ways to plug AI into a live call?

| Way | How | Example | Pros | Cons |
|---|---|---|---|---|
| Native bot integration | Platform calls the bot service | Connect/Genesys → Lex | Easiest, supported, secure | Limited to that bot's capabilities |
| Audio streaming | Platform streams raw audio over WebSocket to your service | Genesys Audio Connector → Nova Sonic | Any model, full control | You build and operate it |
| SIP to an AI vendor | Platform transfers the call over SIP to the AI provider, which transfers back for escalation | Kore.ai, PolyAI | Vendor-managed | Call leaves your platform; more transfers |

### Q51. What latency is acceptable?

**Short answer:** The bot should start answering within about one second of the caller finishing. Over two seconds of silence feels broken, so speak a filler ("one moment") before slow lookups.

The latency budget includes end-of-speech detection, network, model time, text-to-speech, and API lookups. Keep the AI in the same cloud region as the platform.

### Q52. What are barge-in and endpointing?

- **Barge-in:** the caller talks over the bot, and the bot must stop speaking immediately.
- **Endpointing:** deciding the caller has finished speaking. Too eager cuts people off; too slow adds latency.

---

## J. Security and compliance

### Q53. How are calls secured end to end?

- **Transport:** TLS for SIP, SRTP for voice, `wss://` for WebSockets, HTTPS for webhooks, DTLS-SRTP for WebRTC.
- **Access:** SBC IP allowlists; signed WebSocket connections (Genesys Audio Connector signs the upgrade with HMAC); IAM roles with external IDs for Genesys → AWS; least-privilege Lambdas.
- **Data:** no personal data in headers or logs; encrypted context store with expiry; recordings encrypted with retention rules.
- **AI:** verify callers before revealing data; tool allowlists; guardrails against voice prompt injection; disclose that it's an AI.

### Q54. Which compliance items matter most?

PCI DSS for payments (use secure flows; never let the bot hear card numbers unless certified), call-recording consent, India-specific items (licensed TSP, CDRs in India, 140/1600 series, DND/DLT), data residency (choose regions deliberately, e.g. Mumbai), and AI disclosure.

---

## K. The demo and the use case

### Q55. What does the demo prove, and what is simulated?

**Short answer:** The **building blocks explorer** shows how a call physically travels, and with which protocol, for six real journeys. The **WISMO simulator** shows the bot's real logic: verification, API lookup, hand-over rules and the agent screen pop. Phone network, platforms and order system are simulated; the bot's brain is the real code that runs in Lambda.

### Q56. What is real in the repo, and how do we go live?

`src/` (the brain) and `lambda/index.js` run unchanged in AWS Lambda behind Amazon Lex. `docs/04` puts it on a real Amazon Connect number; `docs/05` puts the same bot behind a Genesys Architect flow.

### Q57. Why "Where is my order?" as the first use case?

It's the highest-volume, most automatable call in retail: typically 25–35% of contact-center calls, up to 50% in peak season. It needs every building block (telephony, platform, AI, API, hand-over, agent context) without complex business rules.

### Q58. What are the phases: building blocks first, containment later?

| Phase | Goal | Done when |
|---|---|---|
| **1. Building blocks** | A real call travels operator → trunk/SBC → platform → bot → API → agent, on both platforms, with one working cross-platform transfer | Test calls succeed end to end; failure paths land in a queue |
| **2. AI bot** | Lex WISMO bot live for a small share of calls, with summaries on agent screens | Bot answers correctly; hand-overs carry context |
| **3. Containment and optimisation** | Grow the bot share (5% → 30% → 50%), tune hand-over rules, measure verified containment | Numbers stable for two weeks at each step |

---

## Sources (consulted October 2026)

- Amazon Connect Customer features (telephony coverage): https://aws.amazon.com/products/connect/customer/features/
- Amazon Connect telephony coverage expansion (Mar 2025): https://aws.amazon.com/about-aws/whats-new/2025/03/amazon-connect-global-telephony-coverage/
- AWS re:Post, Amazon Connect for Indian customers: https://repost.aws/questions/QU1TZ14_u_QLm_Iu1Uw4H8qw/how-can-use-amazon-connect-to-india-customer
- Amazon Connect APIs available in Asia Pacific (Mumbai) (Feb 2026): https://aws.amazon.com/about-aws/whats-new/2026/02/amazon-connect-provides-apis-test-simulate-voice-interactions
- Amazon Connect BYOC limitations: https://www.globalcallforwarding.com/amazon-connect-phone-numbers/ ; https://www.unitedworldtelecom.com/amazon-connect-phone-numbers/
- Genesys Cloud CX India guide: https://help.mypurecloud.com/wp-content/uploads/2025/03/Genesys-Cloud-CX-India-v1.6.8.pdf
- Genesys Dynamic Cloud Voice platform: https://help.genesys.cloud/articles/dynamic-cloud-voice-platform-overview/
- Genesys UUI overview and BYOC transport/TLS articles (Genesys Resource Center)
- India VoIP rules 2026 (Ozonetel): https://ozonetel.com/voip-in-india/
- OSP liberalisation (KS&K): https://ksandk.com/telecom/osp-telecom-compliance-india-call-center/
- TRAI 1600/140 clarification (Jul 2026): https://trai.gov.in/sites/default/files/2026-07/PR_No91of2026.pdf
- Amazon Lex features: https://aws.amazon.com/lex/features/ ; What is Lex V2: https://docs.aws.amazon.com/lexv2/latest/dg/what-is.html
- Lex Assisted NLU (AWS ML blog): https://aws.amazon.com/blogs/machine-learning/improve-bot-accuracy-with-amazon-lex-assisted-nlu/
- CPaaS vs CCaaS (GetVoIP): https://getvoip.com/blog/cpaas-vs-ccaas/
- Twilio Elastic SIP Trunking configuration guides: https://www.twilio.com/docs/sip-trunking/sample-configuration
- Kore.ai contact-center integration patterns: https://docs.kore.ai/ai-for-service/contact-center/integrations/overview
- WISMO volume: https://aircall.io/blog/ai-order-agent/
