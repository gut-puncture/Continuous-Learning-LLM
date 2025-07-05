#test_multi_tool_call01.py

from agents import Agent, Runner, WebSearchTool, function_tool, handoff   



planner = Agent(
    name="Planner",
    model="gpt-4.1-2025-04-14",
    tools= [WebSearchTool()],
    handoffs=[],
    instructions=
    "You are a helpful planner assistant whose job is to make a nuanced and detailed plan to complete a research task. "
    "You will always create a preliminary plan first and then use the search tool to get information which will help you finalise your plan. "
    "Once the plan is finalised, you can then communicate the final plan to the user. "
    "No plan ever should be created without the the use of the search tool. No plan should be created without creating a preliminary plan. "
    "Ensure nuanced and smart thinking. Think of multiple angles. Always think what you might be missing and always think of the most creative and nuanced way you can approach a query."
    "Lastly, don't go into a loop of calling the search tool over and over again. Using search tool at max 2 times is allowed. Plan accordingly."
)


result = Runner.run_sync(planner, "I am a biology graduate with no math or coding knowledge. I have got an Associate Product Manager role at Practical Law, which is a tool to help lawyers. "
"I need a nuanced full scale intuitively structured plan to learn Generative AI for my job so I can build agents. "
"I don't want to learn coding or a lot of maths. Only give me topics I need to learn. "
"Give me sources to learn those topics as well. Don't keep the topics top-level, tell me sub-topics etc. as well.")

print(result.final_output)
