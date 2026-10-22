import AdmZip from "adm-zip";
import { Octokit } from '@octokit/rest';
import { parseJUnit } from "../adapters/junit.js";
import type { Store } from "./store.js";
import type { Config } from "../core/config.js";



function makeOctokit(token: string): Octokit {
    return new Octokit({ auth: token });
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
    
    console.log(`[github] Fetching runs for ${owner}/${repo} since ${cutoffDate.toISOString()}`);

    const octokit = makeOctokit(token);

    let workflowRuns: Awaited<ReturnType<typeof octokit.rest.actions.listWorkflowRunsForRepo>>['data']['workflow_runs'];

    try{
        workflowRuns = await octokit.paginate(
            octokit.rest.actions.listWorkflowRunsForRepo,
            { owner, repo, per_page: 100 },
            (response, done) => {
                const filtered = response.data.filter(
                    run => new Date(run.created_at) >= cutoffDate
                );
                if(filtered.length < response.data.length) done();
                return filtered;
            }
        )
    } catch (err) {
        console.log(`[github] Could not reach GitHub API - skipping history populations: ${err}`);
        return;
    }

    console.log(`[github] Found ${workflowRuns.length} workflow runs within the 30-day window`);

    let artifactsFound = 0;
    let runsSaved = 0;

    for(const workflowRun of workflowRuns) {
        try {
            const artifactsRes = await octokit.rest.actions.listWorkflowRunArtifacts({
                owner,
                repo,
                run_id: workflowRun.id,
                per_page: 100
            })

            const match = artifactsRes.data.artifacts.find(a => a.name === artifactName);
            if(!match) continue;

            artifactsFound++;

            const download = await octokit.rest.actions.downloadArtifact({
                owner,
                repo,
                artifact_id: match.id,
                archive_format: 'zip'
            })

            const zipBuffer = Buffer.from(download.data as ArrayBuffer);
            const xmlContents = extractXmlFromZip(zipBuffer);

            if(xmlContents.length === 0) {
                console.log(`[github] Artifact ${match.id} had no XML files - skipping`);
                continue;
            }

            for(const xml of xmlContents) {
                try {
                    const run = parseJUnit(xml, {
                        branch: workflowRun.head_branch ?? config.branch.main,
                        commitSha: workflowRun.head_sha,
                        runId: `gh-${workflowRun.id}`
                    });
                    store.saveRun(run);
                    runsSaved++;
                }
                catch (parseErr) {
                    console.log(`[github] Failed to parse XML from artifact ${match.id}: ${parseErr}`)
                }
            }
        } catch (err) {
            console.log(`[github] Error processing workflow run ${workflowRun.id} -- skipping: ${err}`)
        }
    }

    console.log(`[github] Done - ${artifactsFound} artifacts found, ${runsSaved} runs saved`);
}