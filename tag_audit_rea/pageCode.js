/*
    Desc:
        This is the code used to run the TIQ Custom Tool - Tag Audit REA.
        Saving it here for better visibility.
*/
(function () {
    "use strict";
    window.latestTemplates = {};
    try {
        if (/^https\:\/\/.*\.tealiumiq\.com\/tms/.test(document.URL)) {
            var account,
                profiles,
                numProfiles,
                profileData = [],
                tags,
                og_content = [
                    '"PROFILE/LIBRARY","UID","TAG VENDOR","TAG TITLE","PUBLISH TARGETS","TAG STATUS","TAG NOTES","INHERITED","LATEST TAG UPDATE -TIMESTAMP","LATEST TAG UPDATE -USER","LATEST TAG UPDATE -NOTES","LATEST PUBLISH ENVIRONMENTS","LATEST PUBLISH TIMESTAMP","LATEST PUBLISH USER","LATEST PUBLISH NOTES","CURRENT TAG TEMPLATE VERSION","LATEST AVAILABLE TAG TEMPLATE VERSION","TEMPLATE_VERSION_DIFF","CURRENT CODE VERSION","LATEST CODE VERSION","CODE_VERSION_DIFF"'
                ],
                content = [
                    '"PROFILE/LIBRARY","UID","TAG VENDOR","TAG TITLE","TAG STATUS","INHERITED","LATEST PUBLISH TIMESTAMP","UP TO DATE?","CURRENT CODE VERSION","LATEST CODE VERSION"'
                ]
                account = utui.login.account;
            tealiumTools.send({ account: account, processing: false });

            var download = function (output) {
                var link, $selector, csvUrl, csvString, csvData;

                function pad2(n) {
                    return (n < 10 ? '0' : '') + n;
                  }
                  
                  var date = new Date();
                  var month = pad2(date.getMonth()+1);//months (0-11)
                  var day = pad2(date.getDate());//day (1-31)
                  var year= date.getFullYear();
                  
                  var formattedDate =  year+month+day;

                tealiumTools.send({ account: account, processing: false });

                csvString = output.join("");
                csvData = new Blob([csvString], { type: "text/csv" });
                csvUrl = URL.createObjectURL(csvData);

                $selector = $("body");
                link = document.createElement("a");
                link.setAttribute("id", "profileExport_csv");
                link.setAttribute("href", csvUrl);
                link.setAttribute("download", account + "_account_audit-" + formattedDate + ".csv");
                $selector.append(link);
                $("#profileExport_csv")[0].click();
                $("#profileExport_csv").remove();
            };

            var getEnvs = function (envs) {
                var results = [];
                for (var key in envs) {
                    results.push(key);
                }
                return results.length > 0 ? results.join(" + ") : "Unpublished";
            };

            var htmlDecode = function (input) {
                var decode = document.createElement("textarea");
                decode.innerHTML = input;
                return decode.value.replace(/^-/, "").replace(/\r?\n/g, " ").replace(/,/g, " + ");
            };

            var getPublishHistory = function (profileData) {
                var versionArr = [],
                    tags = {},
                    version;

                Object.keys(profileData.manage || {}).forEach(function (tagId) {
                    tags[tagId] = {};
                });

                for (var version in profileData.publish_history) {
                    var versionObj = profileData.publish_history[version];
                    versionArr.push(version);
                }

                versionArr
                    .sort()
                    .reverse()
                    .forEach(function (date, key) {
                        version = profileData.publish_history[date];
                        var revisionKeys = [];

                        for (var revision in version) {
                            if (utui.util.typeOf(version[revision]) === "object") {
                                revisionKeys.push(revision);
                            }
                        }
                        revisionKeys
                            .sort()
                            .reverse()
                            .forEach(function (revisionDate) {
                                var revisionObj = version[revisionDate],
                                    publishedTags;
                                if (revisionObj.publishedTags) {
                                    publishedTags = JSON.parse(revisionObj.publishedTags);
                                    publishedTags.forEach(function (tagId) {
                                        if (tags[tagId] && !tags[tagId].hasOwnProperty("status")) {
                                            tags[tagId].status = revisionObj.status;
                                            tags[tagId].notes = revisionObj.notes;
                                            tags[tagId].publisher = revisionObj.operator;
                                            tags[tagId].publishDate = revisionDate;
                                            //console.log(tagId, tags[tagId]);
                                        }
                                    });
                                }
                            });
                    });
                return tags;
            };

            var getTagHistory = function (uid, data) {
                uid = "" + uid;
                var tagHistory = {};

                for (var versionId in data.publish_history) {
                    var versionObj = data.publish_history[versionId];
                    var versionTagHistory = {};

                    for (var revisionId in versionObj) {
                        var revision = versionObj[revisionId];
                        var revisionHistory = JSON.parse(revision.history || "[]");
                        var tagEvents = [];

                        for (var i = 0; i < revisionHistory.length; i++) {
                            var event = revisionHistory[i];

                            if (event.action.indexOf("_tag") > 0 && event.data.id && event.data.id + "" === uid) {
                                tagEvents.push(event);
                            }
                        }

                        if (tagEvents.length > 0) {
                            versionTagHistory[revisionId] = {
                                notes: revision.notes,
                                operator: revision.operator,
                                events: tagEvents,
                                status: revision.status
                            };

                            // We need to grab the version title to display to the user - if we have events to show, let's grab the title off a revision while we're here
                            versionTagHistory.versionTitle = revision.title;
                        }
                    }

                    if (_.size(versionTagHistory) > 0) {
                        tagHistory[versionId] = versionTagHistory;
                    }
                }

                return tagHistory;
            };

            var historyObjToArr = function (publishData, tagId) {
                if (!publishData.hasOwnProperty("publishDate")) {
                    return ['"unpublished"', '"unpublished"', '"unpublished"', '"unpublished"'];
                } else {
                    return [
                        '"' + (publishData.status || "").replace(/\,/g, " + ") + '"',
                        "\"'" + (utui.util.formatDate(publishData.publishDate) || "").replace(/\s+/, " ") + '"',
                        '"' + publishData.publisher + '"',
                        '"' + htmlDecode(publishData.notes) + '"'
                    ].join(",");
                }
            };

            var getTagHist = function (tag, data) {
                var tagHistory, history, tagVersionHistory;
                history = getTagHistory(tag, data);
                ////console.log('history', history);
                if (_.isEmpty(history)) {
                    return ['"No History Recorded"', '"No History Recorded"', '"No History Recorded"'].join(",");
                } else {
                    tagHistory = _.sortBy(history, function (val, key) {
                        return key;
                    }).reverse()[0];

                    tagVersionHistory = _.pairs(tagHistory)[0][1];
                    ////console.log("version", tagVersionHistory);
                    return [
                        "\"'" + (utui.util.formatDate(_.pairs(tagHistory)[0][0]) || "").replace(/\s+/, " ") + '"',
                        '"' + tagVersionHistory.operator + '"',
                        '"' + htmlDecode(tagVersionHistory.notes) + '"'
                    ].join(",");
                }
            };

            var getTargets = function (targets) {
                var list = [];
                for (var env in targets) {
                    if (targets[env] === "true") {
                        list.push(env);
                    }
                }
                return list.join(" + ");
            };

            var getTemplateVersion = async function (template) {
                if (template && template.length > 0) {
                    var split = template.split("\n");

                    for (let i = 0; i < 20; i++) {
                        let line = split[i];
                        if (/^\/\/~~tv:/.test(line)) {
                            return line.substring(7);
                        }
                    }
                }

                return "No version found";
            };

            var getCurrentTemplate = async function (uid, profile, revision, type) {
                var result;
                try {
                    result = await utui.service.get(
                        utui.service.restapis.GET_TEMPLATE,
                        {
                            account: utui.login.account,
                            profile: profile,
                            template: "profile." + uid,
                            cb: Math.random(),
                            revision: revision
                        },
                        {
                            async: true
                        }
                    );
                } catch (e) {
                    console.log("no " + type + " template");
                }
                return result;
            };

            var getCurrentTemplateVersion = async function (uid, profile, revision) {
                let template = (await getCurrentTemplate(uid, profile, revision, "revision")) || (await getCurrentTemplate(uid, profile, revision, "profile"));
                return getTemplateVersion(template?.content);
            };

            var getLatestTemplateVersion = async function (tag_id, version) {
                let tempId = tag_id + (version ? "." + version : ""),
                    template,
                    versionString;

                if (!window.latestTemplates[tempId]) {
                    template = await utui.service.get(
                        utui.service.addParamsToURL(utui.service.restapis.GET_LATEST_TEMPLATE, {
                            template: tempId
                        }),
                        {
                            _: window.utui_version
                        },
                        { dataType: "text", cache: true }
                    );

                    versionString = getTemplateVersion(template);
                    window.latestTemplates[tempId] = versionString;
                } else {
                    versionString = window.latestTemplates[tempId];
                }

                return versionString;
            };

            //this method loads the variable that populates the csv file
            var getTags = async function (result, profile) {
                var row,
                    t,
                    history,
                    tags = result.manage,
                    tv_date;
                if (typeof tags == "object") {
                    history = getPublishHistory(result);
                    //console.log(profile,history);
                    for (var tag in tags) {
                        t = tags[tag];

                        let currentTemplateVersion, latestTemplateVersion, tagObject, latestTagVersion;

                        if (t && t.id) {
                            tagObject = utui.manage.config.getTagObjectByTagId(t.tag_id);
                            currentTemplateVersion = await getCurrentTemplateVersion(t.id, profile, result.revision);

                            if (t.config_tagversion && tagObject.configFields && tagObject.configFields.length) {
                                let tagVersion = utui.manage.config.getTagObjectByTagId(t.tag_id).configFields.find(e => e.id == "tagversion");
                                console.log("Tag Audit Logger: tag config fields: ")
                                console.log(utui.manage.config.getTagObjectByTagId(t.tag_id).configFields);

                                if (tagVersion) {
                                    let options = tagVersion.options;
                                    if (options) {
                                        latestTagVersion = Object.values(options)[0];
                                    }
                                } else {
                                    delete t.config_tagversion;
                                }
                            }

                            latestTemplateVersion = await getLatestTemplateVersion(t.tag_id, t.config_tagversion);
                        }

                        //date diff helper variables
                        currentTvDate = currentTemplateVersion.split('.').at(-1);
                        latestTvDate = latestTemplateVersion.split('.').at(-1);
                        var currentTvYear        = currentTvDate.substring(0,4);
                        var currentTvMonth       = currentTvDate.substring(4,6);
                        var currentTvDay         = currentTvDate.substring(6,8);
                        var latestTvYear        = latestTvDate.substring(0,4);
                        var latestTvMonth       = latestTvDate.substring(4,6);
                        var latestTvDay         = latestTvDate.substring(6,8);
                        var currTvDate = new Date(currentTvYear, currentTvMonth, currentTvDay);
                        var lateTvDate = new Date(latestTvYear, latestTvMonth, latestTvDay); 
                        var tvDiffTime = Math.abs(lateTvDate - currTvDate);
                        var tvdiffDays = Math.ceil(tvDiffTime / (1000 * 60 * 60 * 24));             //template version days out of date

                        //should have 13 headers
                        //console.log(profile,t.id,history[t.id]);
                        row = [];
                        row.push('\r\n"' + profile + '"');                                          //TIQ Profile
                        row.push('"' + t.id + '"');                                                 //Tag ID
                        row.push('"' + t.tag_name + '"');                                           //Tag Vendor
                        row.push('"' + t.title + '"');                                              //Tag Title
                        //row.push('"' + getTargets(t.selectedTargets) + '"');                      //Tag publish targets (prod, qa, dev)
                        row.push('"' + t.status + '"');                                             //Tag status, active/inactive
                        //row.push('"' + (t.notes !== undefined ? htmlDecode(t.notes) : "") + '"'); //Tag notes
                        row.push('"' + (t.imported !== undefined ? "Yes" : "No") + '"');            //Is the tag inherited?
                        //row.push(getTagHist(t.id, result));                                       //Latest published environments
                        row.push(historyObjToArr(history[t.id]));                                   //Last publish date
                        //row.push('"' + currentTemplateVersion + '"' || '""');                     //123.am.123
                        //row.push('"' + latestTemplateVersion + '"' || '""');                      //124.am.124
                        row.push('"' + tvdiffDays + '  days out of date"' || '""');      //124.am.[124] < last part
                        row.push('"' + (t.config_tagversion || "N/A") + '"');
                        row.push('"' + (latestTagVersion || "N/A") + '"');
                        content.push(row.join(","));
                    }
                }
            };

            var getProfile = function (profile) {
                return new Promise(function (resolve, reject) {
                    utui.service.get(
                        utui.service.restapis.GET_PROFILE,
                        {
                            account: account,
                            profile: profile,
                            cb: Math.random()
                        },
                        {
                            async: true
                        },
                        async function (data) {
                            //console.log(profile, data);
                            await getTags(data, profile);
                            resolve();
                        },
                        function (err) {
                            reject(err);
                        }
                    );
                });
            };

            var getProfiles = function (profiles) {
                return Promise.all(profiles.map(getProfile));
            };

            var processProfiles = function (data) {
                tealiumTools.send({ processing: true });
                var promise = Promise.resolve();
                var loops,
                    currentSet,
                    profiles = data.profiles;

                console.time("Promsie");

                loops = Math.ceil(profiles.length / 5);
                for (var i = 0; i < loops; i++) {
                    promise = promise
                        .then(function () {
                            currentSet = profiles.splice(0, 5);
                            var batch = loops - profiles.length / currentSet.length;
                            $("#loading_message").text("Processing profile batch " + batch + " / " + loops);
                            return getProfiles(currentSet);
                        })
                        .catch(function (reject) {
                            utui.util.loadingModalStop();
                            console.error("something blow up!", reject);
                        });
                }
                promise.then(function () {
                    console.timeEnd("Promsie");
                    utui.util.loadingModalStop();
                    download(content);
                    console.info("All Done, toast is ready!");
                    alert.info("All Done, toast is ready!");
                    //Retun back to orignial state.
                    utui.service.get(utui.service.restapis.GET_PROFILE, { account: utui.login.account, profile: utui.login.profile }, { async: false }, null);
                });
            };

            var init = function () {
                utui.util.loadingModalStart("Getting Profile List");
                utui.service.get(utui.service.restapis.GET_PROFILES, { account: account, profile: "main" }, { async: true }, processProfiles);
            };

            window._tt_tagAudit = init.bind();
        } else {
            tealiumTools.sendError("Please open this Tool in an active Tealium iQ window");
        }
    } catch (err) {
        utui.util.loadingModalStop();
        tealiumTools.sendError("There was an error processing your request.\n Please contact simon@tealium.com for assitance.");
    }
})();
