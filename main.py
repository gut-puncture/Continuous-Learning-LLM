from agents import Agent, Runner, WebSearchTool, function_tool, handoff   



manager = Agent(
    name="Manager",
    model="gpt-4.1-2025-04-14",
    tools= [],
    handoffs=[],
    instructions=
    "You are a helpful manager assistant whose job is to manage and complete a research task. "
    "You will always create a preliminary plan first and then use the tool `transfer_to_Search_Agent` to get information which will help you finalise your plan. "
    "You can keep refining the search plan till you are satisfied and are allowed and encouraged to call the search agent many times to keep getting information to refine the plan."
    "Once the plan is finalised, you can then communicate the final plan to the search agent and it will provide you with the search results."
    "You're highly encouraged to keep getting data from the search agent and keep refining your understanding of the research problem."
    "When ready to gather search findings, call the tool `transfer_to_Search_Agent` with "
    "{\"query\": \"<your research plan here>\"}. "
    "Once Search Agent returns, process the results. "
    "One you have processed the results, then call the tool `transfer_to_Research_Summariser` "
    "with {\"data\": \"<search results>\"}. "
    "Give as much data as you can to the summariser. "
    "Finally, the summariser will return the final research summary to the user. "
    "Never end a research task without handing off to the summariser."
)

search_agent = Agent(
    name="Search Agent",
    model="gpt-4.1-2025-04-14",
    tools= [WebSearchTool()],
    handoffs=[handoff(manager)],
    instructions="You are a helpful assistant whose job is to search the web for the research objective. "
    "When you have the raw results, call the tool `transfer_to_Manager` with "
    "{\"search_results\": \"<your raw results here>\"}."
)

research_summariser = Agent(
    name="Research Summariser",
    model="o4-mini-2025-04-16",
    handoffs=[handoff(manager)],
    instructions="You are a helpful assistant whose job is to structure and summarise the provided data. Output in perfect markdown."
)

# Now that all agents are defined, set manager handoffs and tools
manager.handoffs = [handoff(search_agent), handoff(research_summariser)]
manager.tools = [WebSearchTool(), search_agent.as_tool(tool_name="search")]

result = Runner.run_sync(manager, "I am a biology graduate with no math or coding knowledge. I have got an Associate Product Manager role at Practical Law, which is a tool to help lawyers. "
"I need a nuanced full scale intuitively structured plan to learn Generative AI for my job so I can build agents. "
"I don't want to learn coding or a lot of maths. Only give me topics I need to learn. "
"Give me sources to learn those topics as well. Don't keep the topics top-level, tell me sub-topics etc. as well.")

print(result.final_output)

