/**
 * Browser-free client for the YC company directory.
 *
 * The directory page embeds its Algolia credentials in plain HTML as
 * `window.AlgoliaOpts = {"app":"…","key":"…"}`. The key is a rotating secured
 * key restricted to the public company indices, so it must be re-extracted
 * from the page on every run — never hardcoded.
 *
 * Company detail pages are Inertia SSR: the full company JSON (founders,
 * socials) is served in the `data-page` attribute to plain HTTP requests,
 * provided a browser User-Agent is sent.
 */

const DIRECTORY_URL = 'https://www.ycombinator.com/companies';
const COMPANY_INDEX = 'YCCompany_production';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function normalizeAlgoliaHit(hit) {
  return {
    id: hit.id,
    object_id: hit.objectID,
    name: hit.name,
    slug: hit.slug,
    former_names: hit.former_names ?? [],
    website: hit.website ?? null,
    yc_url: `https://www.ycombinator.com/companies/${hit.slug}`,
    one_liner: hit.one_liner ?? null,
    long_description: hit.long_description ?? null,
    batch: hit.batch ?? null,
    status: hit.status ?? null,
    stage: hit.stage ?? null,
    industry: hit.industry ?? null,
    subindustry: hit.subindustry ?? null,
    industries: hit.industries ?? [],
    tags: hit.tags ?? [],
    team_size: hit.team_size ?? null,
    location: hit.all_locations ?? null,
    regions: hit.regions ?? [],
    is_hiring: hit.isHiring ?? false,
    nonprofit: hit.nonprofit ?? false,
    top_company: hit.top_company ?? false,
    launched_at: hit.launched_at ?? null,
    logo_url: hit.small_logo_thumb_url ?? null,
  };
}

export function normalizeFounder(f) {
  return {
    user_id: f.user_id,
    full_name: f.full_name,
    title: f.title,
    is_active: f.is_active,
    bio: f.founder_bio ?? null,
    linkedin_url: f.linkedin_url ?? null,
    twitter_url: f.twitter_url ?? null,
    avatar_url: f.avatar_thumb_url ?? null,
    has_email: f.has_email ?? false,
    latest_yc_company: f.latest_yc_company ?? null,
  };
}

export function normalizeCompanyDetail(company, listing) {
  const industries = listing?.industries ?? [];
  return {
    ...listing,
    name: company.name ?? listing?.name,
    slug: company.slug ?? listing?.slug,
    batch: company.batch_name ?? listing?.batch,
    batch_code: company.batch ?? null,
    one_liner: company.one_liner ?? listing?.one_liner,
    long_description: company.long_description ?? listing?.long_description,
    website: company.website ?? listing?.website,
    yc_url: company.ycdc_url ?? listing?.yc_url,
    year_founded: company.year_founded ?? null,
    team_size: company.team_size ?? listing?.team_size,
    location: company.location ?? listing?.location,
    city: company.city ?? null,
    country: company.country ?? null,
    status: company.ycdc_status ?? listing?.status,
    tags: company.tags ?? listing?.tags ?? [],
    industry: industries[0] ?? listing?.industry ?? null,
    subindustry: industries.length > 1 ? industries.slice(1).join(' / ') : listing?.subindustry,
    industries,
    business_model: {
      primary_industry: industries[0] ?? listing?.industry ?? null,
      sub_industries: industries.slice(1),
      tags: company.tags ?? listing?.tags ?? [],
      stage: listing?.stage ?? null,
    },
    social_links: {
      linkedin: company.linkedin_url ?? null,
      twitter: company.twitter_url ?? null,
      facebook: company.fb_url ?? null,
      github: company.github_url ?? null,
      crunchbase: company.cb_url ?? null,
    },
    primary_group_partner: company.primary_group_partner ?? null,
    logo_url: company.logo_url ?? listing?.logo_url,
    company_photos: company.company_photos ?? [],
    app_video_url: company.app_video_url ?? null,
    demo_day_video_url: company.dday_video_url ?? null,
    founders: (company.founders ?? []).map(normalizeFounder),
  };
}

/** Parse `window.AlgoliaOpts = {...}` out of directory page HTML. */
export function parseAlgoliaOpts(html) {
  const m = html.match(/window\.AlgoliaOpts\s*=\s*(\{.*?\})\s*;/s);
  if (!m) return null;
  try {
    const opts = JSON.parse(m[1]);
    if (!opts.app || !opts.key) return null;
    return { app: opts.app, key: opts.key };
  } catch {
    return null;
  }
}

export async function fetchAlgoliaCredentials({ fetchImpl = fetch } = {}) {
  const res = await fetchImpl(DIRECTORY_URL, { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(`Failed to load ${DIRECTORY_URL}: HTTP ${res.status}`);
  }
  const creds = parseAlgoliaOpts(await res.text());
  if (!creds) {
    throw new Error(
      'window.AlgoliaOpts not found in YC directory HTML — the page layout may have changed'
    );
  }
  return creds;
}

/** Query one batch's companies via Algolia REST; paginates until exhausted. */
export async function queryBatch(
  creds,
  batch,
  { hitsPerPage = 1000, delayMs = 300, fetchImpl = fetch } = {}
) {
  const host = `${creds.app.toLowerCase()}-dsn.algolia.net`;
  const url = `https://${host}/1/indexes/${COMPANY_INDEX}/query`;
  const hits = [];
  let page = 0;
  let nbPages = 1;

  while (page < nbPages) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': creds.app,
        'X-Algolia-API-Key': creds.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: '',
        hitsPerPage,
        page,
        facetFilters: [[`batch:${batch}`]],
      }),
    });
    if (!res.ok) {
      throw new Error(`Algolia query failed for batch "${batch}": HTTP ${res.status}`);
    }
    const json = await res.json();
    hits.push(...(json.hits ?? []));
    nbPages = json.nbPages ?? 1;
    page++;
    if (page < nbPages) await sleep(delayMs);
  }

  return hits;
}

/** Extract the Inertia `data-page` JSON from a company page's HTML. */
export function parseDataPage(html) {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  const decoded = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Fetch a company detail page without a browser. Returns the embedded
 * `props.company` object, or null on 404 / parse failure — detail data is
 * enrichment only; the Algolia hit already carries what classification needs.
 */
export async function fetchCompanyDetailHttp(slug, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`https://www.ycombinator.com/companies/${slug}`, {
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (!res.ok) return null;
    const data = parseDataPage(await res.text());
    return data?.props?.company ?? null;
  } catch {
    return null;
  }
}
