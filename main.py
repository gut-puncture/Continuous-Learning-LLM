from agents import Agent, Runner, WebSearchTool, function_tool



manager = Agent(
    name="Manager",
    model="gpt-4.1-2025-04-14",
    tools= [WebSearchTool()],
    handoffs=[search_agent],
    instructions="You are a helpful assistant whose job is to plan the research objective as well as you can. The plan should be detailed and nuanced and you must consider all possible pitfalls and edge cases. After creating the plan you will provide the plan to the Search Agent which will provide you with the search findings. You can call the search agent as many times as you need to get the complete picture. After you have all the information you will provide the information to the Research Summariser which will provide the final summary to you in markdown and you should share it exactly with the user."
)

search_agent = Agent(
    name="Search Agent",
    model="gpt-4.1-2025-04-14",
    tools= [WebSearchTool()],
    handoffs=[manager],
    instructions="You are a helpful assistant whose job is to search the web for the research objective and give the results to the Manager agent."
)

research_summariser = Agent(
    name="Research Summariser",
    model="o4-mini-2025-04-16",
    instructions="You are a helpful assistant whose job is to take all the data you're given after searching and structure and summarise it. The structure should be intuitive and the summary should be detailed."
)

result = Runner.run_sync(manager, "What is the chance of rain in Bengaluru tonight?")

print(result.final_output)
