import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "./App";
import { createDemoFixture } from "./fixtures/demoFixture";

describe("Writer's Room", () => {
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
    expect(
      screen.queryByRole("heading", { name: "Returned Investigations" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /advance fixture/i }));
    expect(screen.queryByTestId("agent-card-lore")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-card-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("agent-card-relationship")).toBeInTheDocument();
    expect(screen.getByTestId("agent-card-impact")).toHaveAttribute("data-status", "waiting");
    expect(screen.getByRole("heading", { name: "Returned Investigations" })).toBeInTheDocument();
    expect(screen.getByText("3 sources · 2 findings")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Timeline Investigation/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Lore Investigation/ }));
    expect(screen.getByRole("dialog", { name: "Lore Investigation" })).toBeInTheDocument();
    expect(screen.getByText("The new story rule needs a clear boundary")).toBeVisible();
    expect(screen.getByText("Fixture canon evidence packet")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close investigation" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /advance fixture/i }));
    expect(screen.queryByTestId("agent-card-timeline")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Timeline Investigation/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /advance fixture/i }));
    expect(screen.queryByTestId("agent-card-relationship")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-card-impact")).toHaveAttribute("data-status", "active");

    await user.click(screen.getByRole("button", { name: /advance fixture/i }));
    expect(screen.queryByRole("heading", { name: "Specialist Workspace" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-card-impact")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Impact Investigation/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Stewardship Report" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stewart is preparing the Stewardship Report." }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Impact Investigation/ }));
    expect(screen.getByRole("dialog", { name: "Impact Investigation" })).toBeInTheDocument();
    expect(screen.getByText("Subsequent projects inherit the mechanic's limits.")).toBeVisible();
    expect(screen.getByText("Introduce as a contained supporting role")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /advance fixture/i }));
    expect(screen.getByRole("heading", { name: "Stewardship Report" })).toBeInTheDocument();
    expect(screen.getByText("Stewart's Assessment")).toBeInTheDocument();
    expect(screen.getByText("Audience Considerations")).toBeInTheDocument();
    expect(screen.getByText("Options & Tradeoffs")).toBeInTheDocument();
    expect(screen.getByText("Introduce as a contained supporting role")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Investigation/ })).toHaveLength(4);
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
});
