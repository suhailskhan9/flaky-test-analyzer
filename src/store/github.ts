import AdmZip from "adm-zip";
import { parseJUnit } from "../adapters/junit.js";
import type { Store } from "./store.js";
import type { Config } from "../core/config.js";

const GITHUB_API = 'https://api.github.com';

function githubHeaders(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
}


async function fetchWorkflowRuns (
    owner: string,
    repo: string,
    token: string,
    cutoffDate: Date
): Promise<any[]> {
    const allRuns: any[] = [];
    let page = 1;

    while(true) {
        const url = `${GITHUB_API}/repos/${owner}/${repo}/actions/runs?per_page=30&page=${page}`;
        const res = await fetch(url, { headers: githubHeaders(token)});

        if(!res.ok) {
            console.log(`[github] API responded ${res.status} fetching runs - stopping pagination`);
            break;
        }

        const data = await res.json() as { workflow_runs: any[] };
        const runs = data.workflow_runs;

        if(!runs || runs.length === 0) break;

        let hitCutoff = false;
        for(const run of runs) {
            const createdAt = new Date(run.created_at);
            if(createdAt < cutoffDate) {
                hitCutoff = true;
                break;
            }
            allRuns.push(run)
        }

        if(hitCutoff) break;
        page++;
    }

    console.log(`[github] Found ${allRuns.length} workflow runs within the 30-day window`);
    return allRuns;
}


async function fetchArtifactZip(
    owner: string,
    repo: string,
    token: string,
    artifactId: number
): Promise<Buffer | null> {
    const url =`${GITHUB_API}/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`;
    const res = await fetch(url, {
        headers: githubHeaders(token),
        redirect: 'follow',
    });

    if(!res.ok) {
        console.log(`[github] Failed to download artifact ${artifactId} - status ${res.status}`);
        return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function getArtifactForRun(
    owner: string,
    repo: string,
    token: string,
    runId: number,
    artifactName: string
): Promise<number | null> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`
    const res = await fetch(url, {headers: githubHeaders(token)});

    if(!res.ok) return null;

    const data = await res.json() as { artifacts: any[]};
    const match = data.artifacts.find((a: any) => a.name === artifactName);
    return match ? match.id : null;
}

function extractXmlFromZip(zipBuffer: Buffer): string[] {
    const zip = new AdmZip(zipBuffer);
    const xmlFiles: string[] = [];

    for(const entry of zip.getEntries()) {
        if(entry.entryName.endsWith('.xml') && !entry.isDirectory) {
            xmlFiles.push(entry.getData().toString('utf-8'));
        }
    }
    return xmlFiles;
}


export async function populateStoreFromGitHub(
    store: Store,
    config: Config
): Promise<void> {
    const { token, owner, repo, artifactName, retentionDays } = config.github;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    console.log(`[github] Fetching runs for ${owner}/${repo} since ${cutoffDate.toISOString()}`)

    let workflowRuns: any[]
    try{
        workflowRuns = await fetchWorkflowRuns(owner, repo, token, cutoffDate);
    }
    catch(err) {
        console.log(`[github] Could not reach GitHub API - skipping history population: ${err}`)
        return;
    }

    let artifactsFound = 0;
    let runsSaved = 0;

    for(const workflowRun of workflowRuns) {
        try{
            const artifactId = await getArtifactForRun(
                owner, repo, token, workflowRun.id, artifactName
            )

            if(artifactId === null) continue;
            artifactsFound++;

            const zipBuffer = await fetchArtifactZip(owner, repo, token, artifactId);
            if(zipBuffer === null) continue;

            const xmlContents = extractXmlFromZip(zipBuffer);
            if(xmlContents.length === 0) {
                console.log(`[github] Artifact ${artifactId} had no XML files - skipping`);
                continue;
            }

            for(const xml of xmlContents) {
                try{
                    const run = parseJUnit(xml, {
                        branch: workflowRun.head_branch ?? config.branch.main,
                        commitSha: workflowRun.head_sha,
                        runId: `gh-${workflowRun.id}`
                    });
                    store.saveRun(run);
                    runsSaved++;
                }
                catch(parseErr) {
                    console.log(`[github] Failed to parse XML from artifact ${artifactId}: ${parseErr}`)
                }
            }
        } catch(err) {
            console.log(`[github] Error processing workflow run ${workflowRun.id} - skipping: ${err}`)
        }
    }

    console.log(`[github] Done - ${artifactsFound} artifacts found, ${runsSaved} runs saved`)
}