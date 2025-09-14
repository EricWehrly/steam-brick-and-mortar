We need to test launching games before we put any amount of effort into this any further

by default, do not attempt to redownload images that we already have cached

SteamWorkflowManager has extensive dead event code for image cache stats

I want you to write a previewer for the images in the cache, in the cache management panel.. 

I also want to re-group these as tabs rather than panels, so that we can then define panels as sections _within_ tabs. From a UX perspective, tabs are already the grouping. Calling them panels is a misnomer, but one that hints at what'd be nice to have:
Grouping current UI sections into panels, and then assigning those panels to tabs in the settings menu.
The different headings in the "Application" tab are a perfect example of different panels that could be defined in different classes and just given to the Application tab.
We'll have to define order somehow, in a way that 

There are two scrollbars in the pause menu if the screen space is reduced enough (on the cache page at least)