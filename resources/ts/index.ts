class swo {
  private code: string = (new URLSearchParams(window.location.search)).get("code");
  private token: string;
  private owner: string;
  private branches = [];

  constructor(returnUrl: string) {
    document.querySelector("#squash").addEventListener("click", () => { this.$squash_click() });

    if (this.code) {
      this.processCode(returnUrl);
    } else {
      this.processToken();
    }
  }

  private async processCode(returnUrl: string) {
    // AUTH_SERVER = the auth server // https://developer.github.com/v3/#oauth2-keysecret
    const authFetch = await fetch("AUTH_SERVER", {
      method: "POST",
      body: JSON.stringify({
        "code": this.code
      })
    })
    let token = JSON.parse(await authFetch.json()).access_token;
      if (token) {
        sessionStorage.setItem("token", token);
      }
      window.location.replace(returnUrl); // remove the ?code parameter and reset the page state
  }

  private async processToken() {
    this.token = sessionStorage.getItem("token");

    if (this.token) {
      let userFetch = await fetch("https://api.github.com/user", {
        method: "GET",
        headers: {
          Authorization: `token ${this.token}`,
        }
      });
      this.owner = (await userFetch.json()).login;

      (document.querySelector("#owner") as HTMLInputElement).value = this.owner;

      let branchResponse = await fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/branches`, {
        method: "GET",
        headers: {
          Authorization: `token ${this.token}`,
        }
      })
      let branches = await branchResponse.json();

      if (this.branches) {
        let $branch = document.querySelector("#branch") as HTMLSelectElement;
        branches.forEach((value: any) => {
          const _option = document.createElement("option");
          _option.textContent = value.name;
          // NOTE by putting this above the line below, we do not need to subtract 1
          _option.value = this.branches.length.toString();
          this.branches.push([value.name, value.commit.sha]);

          $branch.insertAdjacentElement("beforeend", _option);
        });
        document.querySelector("#squash").removeAttribute("disabled");
      } else {
        (document.querySelector("#warns") as HTMLElement).textContent = "[ERR] No branches were found!";
      }

      document.querySelector(".swo").classList.remove("swo--hidden");
    } else {
      document.querySelector(".auth").classList.remove("auth--hidden");
    }
  }

  private async $squash_click() {
    let $branch = document.querySelector("#branch") as HTMLSelectElement;
    let branch_name = this.branches[$branch.value][0];
    let branch_sha = this.branches[$branch.value][1];
    let commit_title = (document.querySelector("#commit_title") as HTMLInputElement) .value;
    let commit_message = (document.querySelector("#commit_message") as HTMLInputElement) .value;

    if (commit_title.trim().length === 0) {
      (document.querySelector("#warns") as HTMLElement).textContent = "[ERR] Enter a commit message!";
      return;
    }

    // Create the backup
    let backupCreateResponse = await fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs`, {
      method: "POST",
      headers: {
        Authorization: `token ${this.token}`,
      },
      body: JSON.stringify({
        "ref": `refs/heads/${branch_name}--swo.backup`,
        "sha": branch_sha
      })
    });
    let backupRef = await backupCreateResponse.json();
    if (!backupRef.ref) {
      (document.querySelector("#warns") as HTMLElement).textContent = `[ERR] Failed to create backup!\n${backupRef.message}`;
      return;
    }

    // Create a copy of upstream master
    let upstreamGetResponse = await fetch(`https://api.github.com/repos/ppy/osu-wiki/git/refs/heads/master`, {
      method: "GET",
      headers: {
        Authorization: `token ${this.token}`,
      }
    });
    let upstream_sha = (await upstreamGetResponse.json()).object.sha;
    if (!upstream_sha) {
      (document.querySelector("#warns") as HTMLElement).textContent = "[ERR] Failed to get upstream's master SHA";
      return;
    }

    let tempMasterCreateResponse = await fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs`, {
      method: "POST",
      headers: {
        Authorization: `token ${this.token}`,
      },
      body: JSON.stringify({
        "ref": `refs/heads/master.swo`,
        "sha": upstream_sha
      })
    });
    let tempMasterRef = await tempMasterCreateResponse.json();
    if (!tempMasterRef.ref) {
      (document.querySelector("#warns") as HTMLElement).textContent = `[ERR] Failed! ${tempMasterRef.message}`;
      return;
    }

    // Create the pull request
    const createPullRequestResponse = await fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/pulls`, {
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
    const pullRequestNumber = (await createPullRequestResponse.json()).number;

    // Merge the pull request
    const mergeFetch = await fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/pulls/${pullRequestNumber}/merge`, {
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
    const merge_sha = (await mergeFetch.json()).sha;

    if (!merge_sha) {
      (document.querySelector("#warns") as HTMLElement).textContent = "[ERR] Merge failed!";
      return;
    }

    // Reset the heads
    await fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs/heads/${branch_name}`, {
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
    await fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs/heads/master.swo`, {
      method: "DELETE",
      headers: {
        Authorization: `token ${this.token}`,
      }
    });

    // Clean up -- delete the backup
    await fetch(`https://api.github.com/repos/${this.owner}/osu-wiki/git/refs/heads/${branch_name}--swo.backup`, {
      method: "DELETE",
      headers: {
        Authorization: `token ${this.token}`,
      }
    });
  }
}

new swo("http://localhost:8080/");
