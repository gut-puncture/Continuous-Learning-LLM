from agents import Agent, Runner, WebSearchTool, function_tool, handoff


coordinator = Agent(
    name="Coordinator",
    model="gpt-4.1-2025-04-14",
    instructions=(
        "When user asks a question, handoff to Planner first. "
        "Then always, always handoff to Writer agent with the Planner output so it can write a concise response. "
        "Finally always handoff to Proofreader agent (named Proof) before the final output."
    ),
    handoffs=[]
)

planner = Agent(
    name="Planner",
    model="gpt-4.1-2025-04-14",
    handoffs=[coordinator],
    instructions=(
        "Break the user question into 3 to 5 web search queries, "
        "run them, summarise key facts. "
        "Then you must always handoff to the Coordinator agent."
    ),
    tools=[WebSearchTool()],
    output_type=list[str]  # list of bullet points
)

writer = Agent(
    name="Writer",
    model="gpt-4.1-2025-04-14", 
    handoffs=[handoff(coordinator)],
    instructions=(
        "Write a concise answer in Markdown using the Planner notes. "
        "Then you must call the tool `transfer_to_coordinator` with your Markdown as a JSON object. "
        "Format exactly: transfer_to_coordinator({\"content\": \"<your markdown here>\"})"
    )
)

proofreader = Agent(
    name="Proof",   
    model="gpt-4.1-2025-04-14",
    handoffs=[handoff(coordinator)],
    instructions=(
        "Ensure the text has <400 words, UK English, no headings. "
        "Then call the tool `transfer_to_coordinator` with the proofread text as JSON. "
        "Use exactly: transfer_to_coordinator({\"content\": \"<proofread text here>\"})"
    )
)

# Assign handoffs now that all agents are defined
coordinator.handoffs = [planner, writer, proofreader]



def main():
    answer = Runner.run_sync(coordinator,
                             input="Explain quantum key distribution.")
    print(answer.final_output)

if __name__ == "__main__":
    main()