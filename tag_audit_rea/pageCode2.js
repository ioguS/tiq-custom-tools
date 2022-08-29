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
                content = [
                    '"PROFILE/LIBRARY","UID","TAG VENDOR","TAG TITLE","PUBLISH TARGETS","TAG STATUS","TAG NOTES","INHERITED","LATEST TAG UPDATE -TIMESTAMP", "LATEST TAG UPDATE -USER", "LATEST TAG UPDATE -NOTES","LATEST PUBLISH ENVIRONMENTS", "LATEST PUBLISH TIMESTAMP", "LATEST PUBLISH USER", "LATEST PUBLISH NOTES", "CURRENT TAG TEMPLATE VERSION", "LATEST AVAILABLE TAG TEMPLATE VERSION", "CURRENT CODE VERSION", "LATEST CODE VERSION"'
                ],
                account = utui.login.account;
            tealiumTools.send({ account: account, processing: false });

            var download = function (output) {
                var link, $selector, csvUrl, csvString, csvData;

                tealiumTools.send({ account: account, processing: false });

                csvString = output.join("");
                csvData = new Blob([csvString], { type: "text/csv" });
                csvUrl = URL.createObjectURL(csvData);

                $selector = $("body");
                link = document.createElement("a");
                link.setAttribute("id", "profileExport_csv");
                link.setAttribute("href", csvUrl);
                link.setAttribute("download", account + " account audit - " + new Date().toJSON().slice(0, 10) + ".csv");
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
                            revision: revision,
                            tool: "tt-tag_audit_rea"
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
                            template: tempId,
                            tool: "tt-tag_audit_rea"
                        }),
                        {
                            _: window.utui_version,
                            tool: "tt-tag_audit_rea"
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

            var getTags = async function (result, profile) {
                var row,
                    t,
                    history,
                    tags = result.manage;
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

                        //console.log(profile,t.id,history[t.id]);
                        row = [];
                        row.push('\r\n"' + profile + '"');
                        row.push('"' + t.id + '"');
                        row.push('"' + t.tag_name + '"');
                        row.push('"' + t.title + '"');
                        row.push('"' + getTargets(t.selectedTargets) + '"');
                        row.push('"' + t.status + '"');
                        row.push('"' + (t.notes !== undefined ? htmlDecode(t.notes) : "") + '"');
                        row.push('"' + (t.imported !== undefined ? "Yes" : "No") + '"');
                        row.push(getTagHist(t.id, result));
                        row.push(historyObjToArr(history[t.id]));
                        row.push('"' + currentTemplateVersion + '"' || '""');
                        row.push('"' + latestTemplateVersion + '"' || '""');
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
                            cb: Math.random(),
                            tool: "tt-tag_audit_rea"
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
                    //Retun back to orignial state.
                    utui.service.get(utui.service.restapis.GET_PROFILE, { account: utui.login.account, profile: utui.login.profile,
                        tool: "tt-tag_audit_rea" }, { async: false }, null);
                });
            };
            var init = function () {
                utui.util.loadingModalStart("Getting Profile List");
                utui.service.get(utui.service.restapis.GET_PROFILES, { account: account, profile: "main",
                    tool: "tt-tag_audit_rea" }, { async: true }, processProfiles);
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
