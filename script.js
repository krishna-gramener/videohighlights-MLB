/* globals bootstrap, YT */

import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { marked } from "https://cdn.jsdelivr.net/npm/marked@12/lib/marked.esm.js";
import { pc } from "https://cdn.jsdelivr.net/npm/@gramex/ui@0.3/dist/format.js";

const youtubeScript = document.createElement("script");
youtubeScript.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName("script")[0];
firstScriptTag.parentNode.insertBefore(youtubeScript, firstScriptTag);
let player;

const $home = document.querySelector("#home");
const $app = document.querySelector("#app");
const $transcript = document.querySelector("#transcript");
const $highlights = document.querySelector("#highlights");
const config = await fetch("config.json").then((r) => r.json());

// Filter videos. #jhi filters for source="jhi", etc.
const filter = location.hash.slice(1);
let videos = filter
  ? Object.fromEntries(Object.entries(config.videos).filter(([, video]) => video.source == filter))
  : config.videos;
if (!Object.keys(videos).length) videos = config.videos;

let currentAdvisorId;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let transcriptData;

const renderInterests = (advisorId, interests) =>
  interests
    .split(/,\s*/)
    .map((interest, i) => [
      i ? ", " : "",
      html`<a class="interest" href="#" data-advisor="${advisorId}" data-interest="${interest}">${interest}</a>`,
    ]);
const homePage = html`
  <h1 class="display-1 my-5 text-center">Video Highlights</h1>

  <p class="text-center display-6">Personalize transcripts. Highlight actionable insights.</p>
  <div class="mx-auto my-5 narrative">
    <h2 class="h5">Videos are slow. Transcripts are long.</h2>
    <q
      >I don't have the patience to watch the entire videos or read the transcript. I don't even know if it's
      relevant!</q
    >
    <h2 class="h5 mt-3">Each person is different</h2>
    <q>Generic summaries waste my time. Tell me what <strong>I</strong> should know!</q>
    <h2 class="h5 mt-3 text-danger">Can marketers personalize video/podcast highlights?</h2>
  </div>

  <hr class="my-5" />
  <div class="mx-auto my-5 narrative">
    <h2>First, extract the audience's interests</h2>
    <p>Let's look at ${Object.keys(config.advisors).length} (hypothetical) advisors.</p>
    <p>From their email interactions, CRM engagements, and web visits, we <strong>automatically extracted their interests</strong>.</p>
  </div>
  <div class="row row-cols-1 row-cols-sm-2 row-cols-md-2 row-cols-lg-3 align-items-stretch">
  ${Object.entries(config.advisors).map(
    ([id, advisor]) => html`
      <div class="col-md mb-3">
        <div class="card h-100">
          <img src="${advisor.img}" class="card-img-top" alt="Profile picture of ${advisor.name}" />
          <div class="card-body">
            <h5 class="card-title">${advisor.name}</h5>
            <div class="card-text">
              <p><strong>${advisor.role}</strong></p>
              <p>${advisor.persona} ${advisor.age} year-old. ${advisor.background}</p>
              <p><strong>Specialties</strong>: ${advisor.specialties}</p>
              <p><strong>Clientele</strong>: ${advisor.clientele}</p>
              <p><strong>Goals</strong>: ${advisor.goals}</p>
              <p><strong>Challenges</strong>: ${advisor.challenges}</p>
              <p><strong>Interests</strong>: ${renderInterests(id, advisor.interests)}</p>
              <p><i class="bi bi-magic text-primary fs-5"></i> Click on interests for supporting interactions.</p>
            </div>
          </div>
        </div>
      </div>
    `
  )}
  </div>

  <div class="mx-auto my-5 narrative">
    <h2>Next, we personalize video transcripts</h2>
    <p>Let's look at these ${
      Object.keys(videos).length
    } public videos from that provide information to healthcare services advisors.</p>
  </div>

  <div class="videos row row-cols-1 row-cols-sm-2 row-cols-lg-3">
    ${Object.entries(videos).map(
      ([key, video]) => html`
        <div class="col py-3">
          <a class="video card h-100 text-decoration-none" href="#?${new URLSearchParams({ video: key })}">
            <div class="card-body">
              <h5 class="card-title">${video.title}</h5>
              <p class="card-text">
                <img class="img-fluid" src="https://img.youtube.com/vi/${video.youtube}/0.jpg" />
              </p>
            </div>
          </a>
        </div>
      `
    )}
  </div>

  <div class="mx-auto my-5 narrative">
    <p><strong>Click the videos above</strong> to see how we:</p>
    <ol>
      <li>Extract the transcript from the video (including the timing)</li>
      <li>Use an LLM to summarize the transcript <em>for each advisor</em>, suggesting actions for <em>their</em> clients.</li>
    </ol>
    <p>Click on the videos to see the personalized summaries. For example, see:</p>
    <ul>
      <li><a href="#?video=four-economic-themes-to-know-in-2024&advisor=jane-doe">Four Economic Themes to Know in 2024</a> for Jane Doe</li>
      <li><a href="#?video=four-economic-themes-to-know-in-2024&advisor=emily-turner">Four Economic Themes to Know in 2024</a> for Emily Turner</li>
      <li><a href="#?video=capitalizing-on-market-shifts-in-2024&advisor=michael-brown">Capitalizing on Market Shifts in 2024</a> for Michael Brown</li>
      <li><a href="#?video=capitalizing-on-market-shifts-in-2024&advisor=david-lee">Capitalizing on Market Shifts in 2024</a> for David Lee</li>
    </ul>
  </div>

</div>
`;

const renderSegment = ({ id, start, text, avg_logprob }) =>
  html`<span class="seek" data-start="${start}" data-id="${id}" data-logprob="${avg_logprob}">${text}</span>`;

async function renderApp(videoId, advisorId) {
  const video = config.videos[videoId];
  transcriptData = await fetch(video.transcript).then((r) => r.json());

  // Group segments into paragraphs that end with ?, ! or .
  let paragraphs = [[]];
  for (const segment of transcriptData.segments) {
    paragraphs.at(-1).push(segment);
    if (segment.text.match(/[.?!]\s*$/)) paragraphs.push([]);
  }
  paragraphs = paragraphs.filter((p) => p.length);

  render(
    html`
      <h2 class="my-3">Transcript</h2>
      <p class="small text-secondary">
        <i class="bi bi-magic text-primary fs-5"></i> Transcripts with timings are dynamically generated from the video.
      </p>
      ${paragraphs.map((segments) => html`<p>${segments.map(renderSegment)}</p>`)}
    `,
    $transcript
  );
  player.cueVideoById(video.youtube);

  transcriptData.segments.forEach((segment) => {
    segment.element = $transcript.querySelector(`[data-id="${segment.id}"]`);
  });

  if (!(advisorId in config.advisors)) advisorId = Object.keys(config.advisors)[0];
  const advisor = config.advisors[advisorId];
  currentAdvisorId = advisorId;

  render(
    html`
      <div class="my-3 d-flex justify-content-between">
        <h2>Highlights</h2>
        <div class="dropdown">
          <button
            class="btn btn-primary dropdown-toggle"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            For ${advisor.name}
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            ${Object.entries(config.advisors).map(
              ([id, advisor]) =>
                html`<li>
                  <a
                    class="dropdown-item d-flex align-items-center ${id == advisorId ? "active" : ""}"
                    href="#?${new URLSearchParams({ video: videoId, advisor: id })}"
                  >
                    <img src="${advisor.img}" class="rounded-circle me-3" height="40" />
                    <div>
                      <h5 class="my-0">${advisor.name}</h5>
                      <div>${advisor.firm}</div>
                    </div>
                  </a>
                </li> `
            )}
          </ul>
        </div>
      </h2>
    </div>
    <div id="advisor-highlights" class="my-3">
      <p class="small text-secondary"><i class="bi bi-magic text-primary fs-5"></i> Highlights are dynamically generated from the transcript and the advisor's profile.</p>
      <div id="animated-text"></div>
    </div>
    <hr class="my-5">
    <div id="advisor-profile" class="my-3">
      <div class="d-flex">
        <img src="${advisor.img}" class="rounded-circle me-3" height="100" />
        <div>
          <h2>${advisor.name}</h2>
          <h3 class="h5">${advisor.firm}</h3>
          <p>${advisor.persona} ${advisor.age} year-old. ${advisor.background}</p>
        </div>
      </div>
      <p><strong>Specialties</strong>: ${advisor.specialties}</p>
      <p><strong>Clientele</strong>: ${advisor.clientele}</p>
      <p><strong>Goals</strong>: ${advisor.goals}</p>
      <p><strong>Challenges</strong>: ${advisor.challenges}</p>
      <p><strong>Interests</strong>: ${renderInterests(advisorId, advisor.interests)}</p>
      <p class="small text-secondary"><i class="bi bi-magic text-primary fs-5"></i> Click on interests for supporting interactions.</p>
    </div>
    `,
    $highlights
  );

  const chunks = advisor.highlights[videoId];
  const $animatedText = $highlights.querySelector("#animated-text");
  const highlights = [];
  for (let i = 0; i < chunks.length; i++) {
    const { p, start_time } = chunks[i];
    for (let j = 0; j < p.length; j += 8) {
      highlights[i] = html`<p>${p.slice(0, j + 1)}</p>`;
      render(highlights, $animatedText);
      await sleep(10);
      if (currentAdvisorId !== advisorId) return;
    }
    const m = Math.floor(start_time / 60);
    const s = Math.floor(start_time % 60);
    highlights[i] = unsafeHTML(
      marked.parse(p + ` <a href="#${start_time}" class="seek" title="See relevant clip">${m}m ${s}s</a>`)
    );
    render(highlights, $animatedText);
  }
}

// When a segment is clicked, jump to that segment in the video
$app.addEventListener("click", (e) => {
  const $segment = e.target.closest("[data-start], .seek");
  if ($segment) {
    e.preventDefault();
    player.seekTo($segment.dataset.start ?? $segment.getAttribute("href").slice(1), true);
    if (player.getPlayerState() != 1) player.playVideo();
  }
});

const errorPage = html`
  <div class="alert alert-danger alert-dismissible my-5 text-center" role="alert">
    <h4 class="alert-heading">Video not found.</h4>
    <div>Please try another one.</div>
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  </div>
`;

function show(ids) {
  for (const [id, show] of Object.entries(ids)) document.getElementById(id).classList.toggle("d-none", !show);
  window.scrollTo(0, 0);
}

async function redraw() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const videoId = hash.get("video");
  const validVideo = videoId in config.videos;
  // TODO: Clear the app, since YouTube API might mess things up?
  // Render the home page if no id is provided
  if (!videoId) {
    show({ home: true, screen: false, app: false });
    render(homePage, $home);
  } else if (!validVideo) {
    show({ home: true, screen: false, app: false });
    render([errorPage, homePage], $app);
  }
  // Render the video page if id is provided, possibly with an error
  else {
    show({ home: false, screen: true, app: true });
    await renderApp(videoId, hash.get("advisor"));
  }
}

window.addEventListener("hashchange", redraw);

window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("video", {
    height: "360",
    width: "640",
    playerVars: { autoplay: 0, playsinline: 1, modestbranding: 1, rel: 0 },
    events: {
      onReady: () => {
        $home.innerHTML = "";
        redraw();
      },
      onStateChange: onPlayerStateChange,
    },
  });
};

let videoPlayingInterval;
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    videoPlayingInterval = setInterval(updatePosition, 200);
    updatePosition();
  } else clearInterval(videoPlayingInterval);
}

function updatePosition() {
  const time = player.getCurrentTime();
  // find the segment that contains this time
  const segment = transcriptData.segments.find((seg) => seg.start <= time && time < seg.end);
  if (segment) transcriptData.segments.forEach((seg) => seg.element.classList.toggle("highlight", seg === segment));
}

const $interestModal = document.querySelector("#interest-modal");
const interestModal = new bootstrap.Modal($interestModal);
const interests = await fetch("interests.json").then((r) => r.json());

document.body.addEventListener("click", (e) => {
  const interest = e.target.closest(".interest");
  if (interest) {
    e.preventDefault();
    const data = interest.dataset;
    const advisor = config.advisors[data.advisor];
    $interestModal.querySelector(".modal-title").textContent = `${advisor.name}: ${data.interest}`;
    const candidates = interests
      .filter((row) => row.advisor == advisor.name)
      .sort((a, b) => b[data.interest] - a[data.interest]);
    // Get up to 6 reasons with over 50% similarity. Else just the top reasons
    let reasons = candidates.filter((row) => row[data.interest] > 0.5).slice(0, 8);
    if (reasons.length == 0) reasons = candidates.slice(0, 1);
    render(
      html`<p>Here's how we know ${advisor.name} is interested in ${data.interest}</p>
        <ol>
          ${reasons.map(
            ({ key, value, ...row }) =>
              html`<li class="my-2">
                <strong>${key}</strong> ${value}
                <small class="text-secondary">(${pc(Math.min(1, row[data.interest] / 0.6))} confidence)</small>
              </li>`
          )}
        </ol>`,
      $interestModal.querySelector(".modal-body")
    );
    interestModal.show();
  }
});
