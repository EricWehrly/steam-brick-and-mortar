Let's say ... "tasks" will be the smallest unit of work that can reasonably be committed as a unit 
that won't break the build

tasks group into "stories" which are, let's say 
the smallest grouping of acceptance criteria that would be intended to ship together

"Features" will mostly be a documentation grouping,
Stories will derive a lot of common meaning, we can use features to hold that context, 
and the stories implicitly include the shared context.
These should also be "testable" in that, at a feature level, we can run some command and get a signal
even if it's just "does this file exist?", we want "yes"

"Milestones" should delineate where a user would notice
The first few milestones will need to be purely technical, but beyond that
milestones should present the user with a reasonable grouping of new functionality
