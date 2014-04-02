/**
 * Define collections used in tests
 */
Posts = new Meteor.Collection("posts");
Authors = new Meteor.Collection("authors");
Comments = new Meteor.Collection("comments");

var allow = function() { return true; };
Posts.allow({ insert: allow, update: allow, remove: allow });
Authors.allow({ insert: allow, update: allow, remove: allow });
Comments.allow({ insert: allow, update: allow, remove: allow });


/**
 * Set up publications for testing
 */
if (Meteor.isServer) {
    var postPublicationChildren = [
            {
                find: function(post) {
                    return Authors.find({ username: post.author });
                }
            },
            {
                find: function(post) {
                    return Comments.find({ postId: post._id });
                },
                children: [
                    {
                        find: function(comment) {
                            return Authors.find({ username: comment.author });
                        }
                    }
                ]
            }
        ];

    Meteor.publishComposite("allPosts", {
        find: function() {
            return Posts.find();
        },
        children: postPublicationChildren
    });

    Meteor.publishComposite("userPosts", function(username) {
        return {
            find: function() {
                return Posts.find({ author: username });
            },
            children: postPublicationChildren
        }
    });
}


/**
 * Define test helper
 */
var testPublication = function(testName, options) {
    options.args = options.args || [];

    Tinytest.addAsync(testName, function(assert, onComplete) {
        var subscription;
        var args = [ options.publication ].concat(options.args);

        args.push(function onSubscriptionReady() {
            options.testHandler(assert, function() {
                subscription.stop();
                onComplete();
            });
        });

        Meteor.call("initTestData");

        subscription = Meteor.subscribe.apply(Meteor, args);
    });
};


/**
 * Define tests
 */
if (Meteor.isClient) {
    testPublication("Should publish all posts", {
        publication: "allPosts",

        testHandler: function(assert, onComplete) {
            var posts = Posts.find();
            assert.equal(posts.count(), 4, "Post count");

            onComplete();
        }
    });

    testPublication("Should publish all post authors", {
        publication: "allPosts",

        testHandler: function(assert, onComplete) {
            var posts = Posts.find();

            posts.forEach(function(post) {
                var author = Authors.findOne({ username: post.author });
                assert.isTrue(typeof author !== "undefined", "Post author");
            });

            onComplete();
        }
    });

    testPublication("Should publish all post comments", {
        publication: "allPosts",

        testHandler: function(assert, onComplete) {
            var comments = Comments.find();
            assert.equal(comments.count(), 5, "Comment count");

            onComplete();
        }
    });

    testPublication("Should publish all post comment authors", {
        publication: "allPosts",

        testHandler: function(assert, onComplete) {
            var comments = Comments.find();

            comments.forEach(function(comment) {
                var author = Authors.findOne({ username: comment.author });
                assert.isTrue(typeof author !== "undefined", "Comment author");
            });

            onComplete();
        }
    });

    testPublication("Should publish one user's posts", {
        publication: "userPosts",
        args: [ "marie" ],

        testHandler: function(assert, onComplete) {
            var allSubscribedPosts = Posts.find();
            assert.equal(allSubscribedPosts.count(), 2, "Post count");

            var postsByOtherAuthors = Posts.find({ author: { $ne: "marie" } });
            assert.equal(postsByOtherAuthors.count(), 0, "Post count");

            onComplete();
        }
    });

    testPublication("Should remove author when comment is deleted", {
        publication: "userPosts",
        args: [ "marie" ],

        testHandler: function(assert, onComplete) {
            var mariesSecondPost = Posts.findOne({ title: "Marie's second post" });

            assert.equal(Authors.find({ "username": "richard" }).count(), 1, "Author present pre-delete");

            var comment = Comments.findOne({ postId: mariesSecondPost._id, text: "Richard's comment" });

            Meteor.call("removeComment", comment._id, function(err) {
                assert.isUndefined(err);

                assert.equal(Authors.find({ "username": "richard" }).count(), 0, "Author absent post-delete");

                onComplete();
            });
        }
    });

    testPublication("Should not remove author when comment is deleted if author record still needed", {
        publication: "userPosts",
        args: [ "marie" ],

        testHandler: function(assert, onComplete) {
            var mariesSecondPost = Posts.findOne({ title: "Marie's second post" });

            assert.equal(Authors.find({ "username": "marie" }).count(), 1, "Author present pre-delete");

            var comment = Comments.findOne({ postId: mariesSecondPost._id, text: "Marie's comment" });

            Meteor.call("removeComment", comment._id, function(err) {
                assert.isUndefined(err);

                assert.equal(Authors.find({ "username": "marie" }).count(), 1, "Author still present post-delete");

                onComplete();
            });
        }
    });

    testPublication("Should remove both post and author if post author is changed", {
        publication: "userPosts",
        args: [ "stephen" ],

        testHandler: function(assert, onComplete) {
            var post = Posts.findOne({ title: "Post with no comments" });

            assert.isTrue(typeof post !== "undefined" , "Post present pre-change");
            assert.equal(Authors.find({ "username": "stephen" }).count(), 1, "Author present pre-change");

            Meteor.call("updatePostAuthor", post._id, "marie", function(err) {
                assert.isUndefined(err);

                assert.equal(Posts.find().count(), 0, "Post absent post-change");
                assert.equal(Authors.find().count(), 0, "Author absent post-change");

                onComplete();
            });
        }
    });

    testPublication("Should publish new author and remove old if comment author is changed", {
        publication: "userPosts",
        args: [ "albert" ],

        testHandler: function(assert, onComplete) {
            var comment = Comments.findOne({ author: "richard" });

            assert.equal(Authors.find({ "username": "richard" }).count(), 1, "Old author present pre-change");
            assert.equal(Authors.find({ "username": "marie" }).count(), 0, "New author absent pre-change");

            Meteor.call("updateCommentAuthor", comment._id, "marie", function(err) {
                assert.isUndefined(err);

                assert.equal(Authors.find({ "username": "richard" }).count(), 0, "Old author absent post-change");
                assert.equal(Authors.find({ "username": "marie" }).count(), 1, "New author present post-change");

                onComplete();
            });
        }
    });
}


/**
 * Utility methods
 */
if (Meteor.isServer) {
    Meteor.methods({
        initTestData: (function() {
            return function() {
                removeAllData();
                initUsers();
                initPosts();
            };

            function removeAllData() {
                Comments.remove({});
                Posts.remove({});
                Authors.remove({});
            }

            function initUsers() {
                Authors.insert({ username: "marie" });
                Authors.insert({ username: "albert" });
                Authors.insert({ username: "richard" });
                Authors.insert({ username: "stephen" });
                Authors.insert({ username: "john" });
            }

            function initPosts() {
                insertPost("Marie's first post", "marie", [{
                    text: "Comment text",
                    author: "albert"
                }]);

                insertPost("Marie's second post", "marie", [
                    {
                        text: "Richard's comment",
                        author: "richard"
                    },
                    {
                        text: "Stephen's comment",
                        author: "stephen"
                    },
                    {
                        text: "Marie's comment",
                        author: "marie"
                    }
                ]);

                insertPost("Post with one comment", "albert", [{
                    text: "Comment text",
                    author: "richard"
                }]);

                insertPost("Post with no comments", "stephen");
            }

            function insertPost(title, author, comments) {
                var postId = Posts.insert({
                    title: title,
                    author: author
                });

                if (comments) {
                    for (var i = 0; i < comments.length; i++) {
                        var commentData = _.extend({}, comments[i], { postId: postId });

                        Comments.insert(commentData);
                    }
                }
            }
        }()),

        removeComment: function(commentId) {
            var count = Comments.remove(commentId);
        },

        updatePostAuthor: function(postId, newAuthor) {
            Posts.update({ _id: postId }, { $set: { author: newAuthor } });
        },

        updateCommentAuthor: function(commentId, newAuthor) {
            Comments.update({ _id: commentId }, { $set: { author: newAuthor } });
        }
    });
}