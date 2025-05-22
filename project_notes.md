# Project Notes

## Questions

1. What exactly is provided to each agent during handoff by the previous agent? Is it all the history of the tasks which are done till now? Is it a summary?
2. Can I control exactly what is given from the history to each agents?
3. Can we access all the logs and history of the tasks being done? I would like to track that myself and store it for each task. It could be beneficial to change this task history as well, for example when the history gets too long, we can delete older context or summarise some parts.
4. Can we access the raw output of the search result which is given to the LLM? 
5. How can we build a way to store shit in separate file like objects? Objects which can be referred to in the context and the data from which can be retrieved by an agent?

## Objective

Code GPT-5/CLM with Model Routing

## Next Steps
1. 



## ToDO
1. Give user input from thread to a model for classifying and tagging with different stuff. Will we chunk this? Yes, because of message length.
2. Retrieve messages for each time inference occurs.
3. Create model which can generate confidence score before doing inference. Create model which can classify the type of user query.
4. Create model which can identify how well a user query is answered by the model.
5. Memory Knowledge Graph creation.
6. Memory re-ranking.
7. Search capability for model to gather info on uncertain responses in the back-end.
8. Search tool to be used while answering questions while inference?
9. LoRA for "important" and global stuff.