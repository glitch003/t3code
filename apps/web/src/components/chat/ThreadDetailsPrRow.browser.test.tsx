import { EnvironmentId, ProjectId, ThreadId, type PullRequestCheck } from "@t3tools/contracts";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { userEvent } from "vite-plus/test/browser";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  status: "success" as PullRequestCheck["status"],
  extraStatus: null as PullRequestCheck["status"] | null,
  mergeMethods: ["merge"] as Array<"merge" | "squash" | "rebase">,
  perform: vi.fn(),
  newThread: vi.fn(),
  prepareThread: vi.fn(),
  checkoutError: null as Error | null,
  addToast: vi.fn(),
  updateToast: vi.fn(),
  startTurn: vi.fn(),
  canOperate: true,
  branch: "feature" as string | null,
  projectId: "project",
  hasThread: true,
  conflicting: false,
}));

vi.mock(import("~/state/entities"), async (importOriginal) => ({
  ...(await importOriginal()),
  useQuietThreadShell: (() =>
    state.hasThread
      ? {
          id: ThreadId.make("current-thread"),
          projectId: ProjectId.make(state.projectId),
          branch: state.branch,
          runtimeMode: "full-access",
          interactionMode: "default",
        }
      : null) as never,
  // Rows render a pull request only with a project, so this does not reach tests that pass none.
  useServerConfigs: (() =>
    new Map([
      [
        EnvironmentId.make("environment"),
        { environment: { capabilities: { pullRequests: true } } },
      ],
    ])) as never,
}));
const queryData = () => ({
  projectId: ProjectId.make("project"),
  workspaceRoot: "/workspace",
  url: "https://github.com/owner/repo/pull/1",
  number: 1,
  title: "Test PR",
  state: "open",
  isDraft: false,
  mergeability: state.conflicting ? "conflicting" : "mergeable",
  headBranch: "feature",
  baseBranch: "main",
  changedFiles: 1,
  additions: 1,
  deletions: 0,
  checks: [state.status, ...(state.extraStatus ? [state.extraStatus] : [])].map((status) => ({
    name: `CI-${status}`,
    status,
    description: null,
    url: null,
  })),
  capabilities: { actions: ["merge"], mergeMethods: state.mergeMethods },
  viewerPermissions: { actions: ["merge"] },
  mergeCapabilities: {
    merge: state.mergeMethods.includes("merge"),
    squash: state.mergeMethods.includes("squash"),
    rebase: state.mergeMethods.includes("rebase"),
  },
});
vi.mock(import("~/state/query"), async (importOriginal) => ({
  ...(await importOriginal()),
  useEnvironmentQuerySelector: ((_atom: unknown, select: (result: unknown) => unknown) =>
    select(AsyncResult.success(queryData()))) as never,
  useEnvironmentQueryIsNewer: () => true,
  useEnvironmentQueryRefresh: () => ({ refresh: vi.fn(), isPending: () => false }),
  useEnvironmentQuery: (() => ({
    data: {
      code: { additions: 1, deletions: 0 },
      tests: { additions: 0, deletions: 0 },
      mocks: { additions: 0, deletions: 0 },
      generated: { additions: 0, deletions: 0 },
      docs: { additions: 7, deletions: 3 },
    },
    isPending: false,
  })) as never,
}));
vi.mock(import("../pullRequest/usePullRequestActions"), async (importOriginal) => ({
  ...(await importOriginal()),
  usePullRequestActionRunner: () => ({ actionPending: false, perform: state.perform }),
}));
vi.mock(import("~/state/use-orchestration-command"), () => ({
  useOrchestrationCommand: (() => state.startTurn) as never,
}));
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentScope: () => state.canOperate,
}));

vi.mock(import("~/hooks/useHandleNewThread"), async (original) => ({
  ...(await original()),
  useNewThreadHandler: (() => state.newThread) as never,
}));
vi.mock(import("~/state/sourceControlActions"), async (original) => ({
  ...(await original()),
  usePreparePullRequestThreadAction: (() => ({
    run: state.prepareThread,
    isAllowed: true,
    error: state.checkoutError,
  })) as never,
}));
vi.mock(import("../ui/toast"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    toastManager: {
      ...actual.toastManager,
      add: state.addToast,
      update: state.updateToast,
    } as never,
  };
});

import { act, render as renderUi } from "../../../test/render";
import { useUiStateStore } from "~/uiStateStore";
import { ThreadDetailsPrRow } from "./ThreadDetailsPrRow";

const threadRef = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("current-thread"),
};

it("merges with the last selected merge method", async () => {
  await using screen = await setup();
  const { container } = screen;
  state.mergeMethods = ["merge", "squash"];
  useUiStateStore.getState().setPullRequestMergeMethod("squash");
  await act(async () => {
    await screen.rerender(
      <ThreadDetailsPrRow
        threadRef={threadRef}
        environmentId={EnvironmentId.make("environment")}
        pr={null}
        number={1}
        status={null}
        project={null}
        label="Test PR"
        openAriaLabel="Open PR"
        onOpen={vi.fn()}
      />,
    );
  });
  const clickMerge = async (scope: ParentNode) =>
    await act(async () => {
      [...scope.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Merge")!
        .click();
    });
  await clickMerge(container);
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain("using squash");
  await clickMerge(dialog);
  expect(state.perform).toHaveBeenCalledWith("merge", "squash");
});

it("requires a new merge click after passing checks become pending and pass again", async () => {
  await using screen = await setup();
  const { container } = screen;
  const render = () => (
    <ThreadDetailsPrRow
      threadRef={threadRef}
      environmentId={EnvironmentId.make("environment")}
      pr={null}
      number={1}
      status={null}
      project={null}
      label="Test PR"
      openAriaLabel="Open PR"
      onOpen={vi.fn()}
    />
  );
  const clickMerge = async () =>
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Merge")!
        .click();
    });
  const dialogs = () => [...document.querySelectorAll('[role="alertdialog"]')];

  await act(async () => await screen.rerender(render()));
  await clickMerge();
  expect(dialogs()).toHaveLength(1);
  await act(async () => {
    state.status = "pending";
    await screen.rerender(render());
  });
  expect(dialogs()).toHaveLength(0);
  await act(async () => {
    state.status = "success";
    await screen.rerender(render());
  });
  expect(dialogs()).toHaveLength(0);
  await clickMerge();
  expect(dialogs()).toHaveLength(1);
  expect(state.perform).not.toHaveBeenCalled();
});

async function setup() {
  state.perform.mockReset();
  state.checkoutError = null;
  state.newThread.mockReset().mockResolvedValue({
    draftId: DraftId.make("new-draft"),
    threadId: ThreadId.make("new-thread"),
  });
  state.prepareThread.mockReset().mockResolvedValue({
    _tag: "Success",
    value: { branch: "feature", worktreePath: "/workspace/feature", isOnPullRequestHead: true },
  });
  state.addToast.mockReset().mockReturnValue("checkout-toast");
  state.updateToast.mockReset();
  state.startTurn.mockReset().mockResolvedValue({ _tag: "Success", value: undefined });
  state.canOperate = true;
  state.branch = "feature";
  state.projectId = "project";
  state.hasThread = true;
  state.conflicting = false;

  state.status = "success";
  state.extraStatus = null;
  state.mergeMethods = ["merge"];
  useUiStateStore.getState().setPullRequestMergeMethod("merge");
  return renderUi(null);
}

function RepairRow() {
  return (
    <ThreadDetailsPrRow
      threadRef={threadRef}
      environmentId={threadRef.environmentId}
      pr={null}
      number={1}
      status={null}
      project={null}
      label="Test PR"
      openAriaLabel="Open PR"
      onOpen={vi.fn()}
    />
  );
}

it.each(["Fix", "Resolve"])(
  "sends %s to the existing thread without consuming its draft",
  async (label) => {
    await using screen = await setup();
    state.status = "failure";
    state.conflicting = label === "Resolve";
    const drafts = useComposerDraftStore.getState();
    drafts.setPrompt(threadRef, "My unfinished message");
    await screen.rerender(<RepairRow />);

    await userEvent.click(screen.getByRole("button", { name: label, exact: true }));

    expect(state.startTurn).toHaveBeenCalledTimes(1);
    expect(state.startTurn).toHaveBeenCalledWith({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        message: {
          messageId: expect.any(String),
          role: "user",
          text: expect.stringContaining("https://github.com/owner/repo/pull/1"),
          attachments: [],
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        dispatchMode: "queue",
      },
    });
    expect(state.startTurn.mock.calls[0]![0].input.message.text).toContain(
      label === "Fix" ? "CI-failure" : "main",
    );
    expect(drafts.getComposerDraft(threadRef)?.prompt).toBe("My unfinished message");
    expect(state.newThread).not.toHaveBeenCalled();
    expect(state.prepareThread).not.toHaveBeenCalled();
  },
);

it.each(["permission", "draft", "project", "branch", "environment"])(
  "does not send a repair task with a mismatched %s",
  async (reason) => {
    await using screen = await setup();
    state.status = "failure";
    if (reason === "permission") state.canOperate = false;
    if (reason === "draft") state.hasThread = false;
    if (reason === "project") state.projectId = "another-project";
    if (reason === "branch") state.branch = "main";
    await screen.rerender(
      <ThreadDetailsPrRow
        threadRef={
          reason === "environment"
            ? { ...threadRef, environmentId: EnvironmentId.make("another-environment") }
            : threadRef
        }
        environmentId={threadRef.environmentId}
        pr={null}
        number={1}
        status={null}
        project={null}
        label="Test PR"
        openAriaLabel="Open PR"
        onOpen={vi.fn()}
      />,
    );
    await expect.element(screen.getByRole("button", { name: "Fix", exact: true })).toBeDisabled();
    expect(state.startTurn).not.toHaveBeenCalled();
  },
);

it("prevents duplicate submissions and permits retry after a failed send", async () => {
  await using screen = await setup();
  state.status = "failure";
  let finish!: (result: { _tag: "Failure" }) => void;
  const pending = new Promise<{ _tag: "Failure" }>((resolve) => {
    finish = resolve;
  });
  state.startTurn.mockReturnValueOnce(pending);
  await screen.rerender(<RepairRow />);
  const button = screen.getByRole("button", { name: "Fix", exact: true });
  await userEvent.click(button);
  await expect.element(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
  expect(state.startTurn).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ _tag: "Failure" });
    await pending;
  });
  await expect.element(button).toBeEnabled();
  expect(state.addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  await userEvent.click(button);
  expect(state.startTurn).toHaveBeenCalledTimes(2);
});
