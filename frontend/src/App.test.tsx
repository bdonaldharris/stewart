import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";
import { StewardshipReport } from "./components/StewardshipReport";
import { createDemoFixture } from "./fixtures/demoFixture";
import type { WriterRoomEventSource } from "./services/eventSource";

describe("Writer's Room", () => {
  it("focuses the writer input when the application starts", () => {
    render(<App eventSource={createDemoFixture()} />);

    expect(
      screen.getByPlaceholderText("Describe the story idea you want Stewart to investigate…"),
    ).toHaveFocus();
    expect(
      screen.queryByText(/development fixture|not live|representative/i),
    ).not.toBeInTheDocument();
  });

  it("moves completed specialists into returned investigations before the report", async () => {
    const user = userEvent.setup();
    render(<App eventSource={createDemoFixture()} />);

    const composer = screen.getByPlaceholderText(
      "Describe the story idea you want Stewart to investigate…",
    );
    await user.type(composer, "Introduce a recurring cosmic archivist after a major event.");
    await user.click(screen.getByRole("button", { name: "Send proposal to Stewart" }));

    expect(screen.getByRole("heading", { name: "Specialist Workspace" })).toBeInTheDocument();
    expect(screen.getByTestId("agent-card-lore")).toHaveAttribute("data-status", "active");
    expect(screen.getByTestId("agent-card-timeline")).toHaveAttribute("data-status", "active");
    expect(screen.getByTestId("agent-card-relationship")).toHaveAttribute(
      "data-status",
      "active",
    );
    expect(screen.getByTestId("agent-card-impact")).toHaveAttribute("data-status", "waiting");
    expect(screen.queryByText("Evidence received")).not.toBeInTheDocument();
    expect(screen.queryByText("Writer & Stewart")).not.toBeInTheDocument();
    expect(screen.queryByText("Conversation")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue investigation" }));
    expect(screen.queryByTestId("agent-card-lore")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-card-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("agent-card-relationship")).toBeInTheDocument();
    expect(screen.getByTestId("agent-card-impact")).toHaveAttribute("data-status", "waiting");
    expect(screen.queryByText("Evidence received")).not.toBeInTheDocument();
    expect(screen.queryByText("3 sources · 2 findings")).not.toBeInTheDocument();
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
    expect(screen.queryByText("View investigation →")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Timeline Investigation/ }),
    ).not.toBeInTheDocument();

    const loreTrigger = screen.getByRole("button", { name: /Lore Investigation/ });
    await user.click(loreTrigger);
    expect(screen.getByRole("dialog", { name: "Lore Investigation" })).toBeInTheDocument();
    expect(screen.getByText("3 sources · 2 findings")).toBeVisible();
    expect(screen.getByText("The new story rule needs a clear boundary")).toBeVisible();
    expect(screen.getByText("Canon evidence packet")).toBeVisible();
    const closeButton = screen.getByRole("button", { name: "Close investigation" });
    expect(closeButton).toHaveFocus();
    await user.click(closeButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(loreTrigger).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Continue investigation" }));
    expect(screen.queryByTestId("agent-card-timeline")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Timeline Investigation/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue investigation" }));
    expect(screen.queryByTestId("agent-card-relationship")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-card-impact")).toHaveAttribute("data-status", "active");

    await user.click(screen.getByRole("button", { name: "Continue investigation" }));
    expect(screen.queryByRole("heading", { name: "Specialist Workspace" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-card-impact")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Impact Investigation/ })).toBeInTheDocument();
    expect(screen.queryByText("4 affected areas · 2 tradeoffs")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Stewardship Report" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stewart is preparing the Stewardship Report." }),
    ).toBeInTheDocument();

    const impactTrigger = screen.getByRole("button", { name: /Impact Investigation/ });
    await user.click(impactTrigger);
    expect(screen.getByRole("dialog", { name: "Impact Investigation" })).toBeInTheDocument();
    expect(screen.getByText("4 affected areas · 2 tradeoffs")).toBeVisible();
    expect(screen.getByText("Subsequent projects inherit the mechanic's limits.")).toBeVisible();
    expect(screen.getByText("Introduce as a contained supporting role")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(impactTrigger).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Continue investigation" }));
    expect(screen.getByRole("heading", { name: "Stewardship Report" })).toBeInTheDocument();
    expect(screen.queryByText("Investigation complete")).not.toBeInTheDocument();
    expect(screen.getByText("Stewart's Assessment")).toBeInTheDocument();
    expect(screen.getByText("Audience Considerations")).toBeInTheDocument();
    expect(screen.queryByText("Affected Areas")).not.toBeInTheDocument();
    expect(screen.getByText("Options & Tradeoffs")).toBeInTheDocument();
    expect(screen.getByText("Introduce as a contained supporting role")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Test the mechanic and relationship fit before creating cross-project obligations.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Accept broader continuity commitments in exchange for immediate connective value.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Investigation/ })).toHaveLength(4);
    expect(screen.queryByText("4 returned")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/development fixture|not live|representative/i),
    ).not.toBeInTheDocument();

    for (const name of [
      "Lore Investigation",
      "Timeline Investigation",
      "Relationship Investigation",
      "Impact Investigation",
    ]) {
      await user.click(screen.getByRole("button", { name: `${name} View` }));
      expect(screen.getByRole("dialog", { name })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close investigation" }));
    }
  });

  it("keeps clarification inside the conversation before revealing specialists", async () => {
    const user = userEvent.setup();
    render(<App eventSource={createDemoFixture({ clarificationFirst: true })} />);

    await user.type(
      screen.getByPlaceholderText("Describe the story idea you want Stewart to investigate…"),
      "A character appears after a major event.",
    );
    await user.click(screen.getByRole("button", { name: "Send proposal to Stewart" }));

    expect(
      screen.getByText("Before I begin: what point in the MCU timeline should frame this proposal?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stewart is refining the investigation." })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Specialist Workspace" })).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Describe the story idea you want Stewart to investigate…"),
      "Immediately after the event.",
    );
    await user.click(screen.getByRole("button", { name: "Send proposal to Stewart" }));

    expect(screen.getByRole("heading", { name: "Specialist Workspace" })).toBeInTheDocument();
    expect(screen.getByTestId("agent-card-impact")).toHaveTextContent(
      "Waiting for specialist findings",
    );
  });

  it("renders live backend events as they stream", async () => {
    const source: WriterRoomEventSource = {
      mode: "backend",
      canAdvance: false,
      async sendMessage(message, onEvents) {
        const events = [
          {
            type: "writer_message" as const,
            message: { id: "writer-live", speaker: "writer" as const, text: message },
          },
          { type: "investigation_started" as const },
          {
            type: "specialist_status" as const,
            agent: "lore" as const,
            status: "active" as const,
            activity: "Searching sources with Parallel",
          },
        ];
        events.forEach((event) => onEvents?.([event]));
        return events;
      },
      async advance() {
        return [];
      },
    };
    const user = userEvent.setup();
    render(<App eventSource={source} />);

    await user.type(
      screen.getByPlaceholderText("Describe the story idea you want Stewart to investigate…"),
      "A live proposal",
    );
    await user.click(screen.getByRole("button", { name: "Send proposal to Stewart" }));

    expect(screen.getByText("A live proposal")).toBeInTheDocument();
    expect(screen.getByTestId("agent-card-lore")).toHaveTextContent(
      "Searching sources with Parallel",
    );
    expect(screen.queryByRole("button", { name: "Continue investigation" })).not.toBeInTheDocument();
  });

  it("omits an option description when the live contract has no distinct description", () => {
    const { container } = render(
      <StewardshipReport
        report={{
          assessment: "A concise assessment.",
          continuityConsiderations: [],
          opportunities: [],
          audienceConsiderations: [],
          options: [
            {
              title: "Use a supporting role",
              benefits: ["Lower continuity load"],
              tradeoffs: ["Less immediate narrative reach"],
            },
          ],
        }}
      />,
    );

    expect(container.querySelector(".option-description")).toBeNull();
    expect(screen.getByText("Use a supporting role")).toBeInTheDocument();
  });
});
