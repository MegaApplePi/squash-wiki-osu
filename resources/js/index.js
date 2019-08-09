var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class swo {
    constructor(returnUrl) {
        this.code = (new URLSearchParams(window.location.search)).get("code");
        this.branches = [];
        document.querySelector("#squash").addEventListener("click", () => { this.$squash_click(); });
        if (this.code) {
            this.processCode(returnUrl);
        }
        else {
            this.processToken();
        }
    }
    processCode(returnUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            // AUTH_SERVER = the auth server // https://developer.github.com/v3/#oauth2-keysecret
            const authFetch = yield fetch("AUTH_SERVER", {
                method: "POST",
                body: JSON.stringify({
                    "code": this.code
                })
            });
            let token = JSON.parse(yield authFetch.json()).access_token;
            if (token) {
                sessionStorage.setItem("token", token);
            }
            window.location.replace(returnUrl); // remove the ?code parameter and reset the page state
        });
    }
    processToken() {
        return __awaiter(this, void 0, void 0, function* () {
            this.token = sessionStorage.getItem("token");
            if (this.token) {
                let userFetch = yield fetch("https://api.github.com/user", {
                    method: "GET",
                    headers: {
                        Authorization: `token ${this.token}`,
                    }
                });
                this.owner = (yield userFetch.json()).login;
                document.querySelector("#owner").value = this.owner;
                let branchResponse = yield fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/branches`, {
                    method: "GET",
                    headers: {
                        Authorization: `token ${this.token}`,
                    }
                });
                let branches = yield branchResponse.json();
                if (this.branches) {
                    let $branch = document.querySelector("#branch");
                    branches.forEach((value) => {
                        const _option = document.createElement("option");
                        _option.textContent = value.name;
                        // NOTE by putting this above the line below, we do not need to subtract 1
                        _option.value = this.branches.length.toString();
                        this.branches.push([value.name, value.commit.sha]);
                        $branch.insertAdjacentElement("beforeend", _option);
                    });
                    document.querySelector("#squash").removeAttribute("disabled");
                }
                else {
                    document.querySelector("#warns").textContent = "[WARN] No branches were found!";
                }
                document.querySelector(".swo").classList.remove("swo--hidden");
            }
            else {
                document.querySelector(".auth").classList.remove("auth--hidden");
            }
        });
    }
    $squash_click() {
        return __awaiter(this, void 0, void 0, function* () {
            let $branch = document.querySelector("#branch");
            let branch_name = this.branches[$branch.value][0];
            let branch_sha = this.branches[$branch.value][1];
            let commit_title = document.querySelector("#commit_title").value;
            let commit_message = document.querySelector("#commit_message").value;
            if (commit_title.trim().length === 0) {
                document.querySelector("#warns").textContent = "Enter a commit message!";
                return;
            }
            // Create the backup
            let backupCreateResponse = yield fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs`, {
                method: "POST",
                headers: {
                    Authorization: `token ${this.token}`,
                },
                body: JSON.stringify({
                    "ref": `refs/heads/${branch_name}--swo.backup`,
                    "sha": branch_sha
                })
            });
            let backupRef = yield backupCreateResponse.json();
            if (!backupRef.ref) {
                document.querySelector("#warns").textContent = `Failed to create backup!\n${backupRef.message}`;
                return;
            }
            // Create a copy of upstream master
            let upstreamGetResponse = yield fetch(`https://api.github.com/repos/ppy/osu-wiki/git/refs/heads/master`, {
                method: "GET",
                headers: {
                    Authorization: `token ${this.token}`,
                }
            });
            let upstream_sha = (yield upstreamGetResponse.json()).object.sha;
            if (!upstream_sha) {
                document.querySelector("#warns").textContent = "Failed to get upstream's master SHA";
                return;
            }
            let tempMasterCreateResponse = yield fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs`, {
                method: "POST",
                headers: {
                    Authorization: `token ${this.token}`,
                },
                body: JSON.stringify({
                    "ref": `refs/heads/master.swo`,
                    "sha": upstream_sha
                })
            });
            let tempMasterRef = yield tempMasterCreateResponse.json();
            if (!tempMasterRef.ref) {
                document.querySelector("#warns").textContent = `Failed! ${tempMasterRef.message}`;
                return;
            }
            // Create the pull request
            const createPullRequestResponse = yield fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/pulls`, {
                method: "POST",
                headers: {
                    Authorization: `token ${this.token}`,
                },
                body: JSON.stringify({
                    title: `[SWO] ${branch_name}`,
                    base: "master.swo",
                    head: branch_name,
                    body: ""
                })
            });
            const pullRequestNumber = (yield createPullRequestResponse.json()).number;
            // Merge the pull request
            const mergeFetch = yield fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/pulls/${pullRequestNumber}/merge`, {
                method: "PUT",
                headers: {
                    Authorization: `token ${this.token}`,
                },
                body: JSON.stringify({
                    commit_title: commit_title,
                    commit_message: commit_message,
                    merge_method: "squash"
                })
            });
            const merge_sha = (yield mergeFetch.json()).sha;
            if (!merge_sha) {
                document.querySelector("#warns").textContent = "Merge failed!";
                return;
            }
            // Reset the heads
            yield fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs/heads/${branch_name}`, {
                method: "PATCH",
                headers: {
                    Authorization: `token ${this.token}`,
                },
                body: JSON.stringify({
                    sha: merge_sha,
                    force: true
                })
            });
            // Clean up -- delete the temporary master
            yield fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs/heads/master.swo`, {
                method: "DELETE",
                headers: {
                    Authorization: `token ${this.token}`,
                }
            });
            // Clean up -- delete the backup
            yield fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs/heads/${branch_name}--swo.backup`, {
                method: "DELETE",
                headers: {
                    Authorization: `token ${this.token}`,
                }
            });
        });
    }
}
new swo("http://localhost:8080/");
//# sourceMappingURL=index.js.map