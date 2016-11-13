//# -*- coding: utf-8 -*-
//# Copyright 2015 be-cloud.be Jerome Sonnet <jerome.sonnet@be-cloud.be>
//# Copyright 2016 Sodexis
//# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl).

var odoo;
var openerp;
var gapi;
var google;

odoo.define('document_gdrive.menu_item', function(require) {
    "use strict";

    var core = require('web.core');
    var Model = require('web.DataModel');
    var Sidebar = require('web.Sidebar');
    var Dialog = require('web.Dialog');
    var ActionManager = require('web.ActionManager');
    var session = require('web.session');

    var _t = core._t;
    var QWeb = core.qweb;

    var scope = ['profile https://www.googleapis.com/auth/drive'];

    Sidebar.include({

        on_gdrive_doc: function() {
            var self = this;

            if(odoo.gdrive_oauthToken){
                // We are good to go...
                self.openPicker();
            } else {
                // Else we need to authenticate
                // Get Server-Side token if available
                try {
                    new Model("res.users").call("read", [[session.uid], ["oauth_access_token"]]).done(function(result) {
                        if(result){
                            var user = result[0];
                            odoo.gdrive_oauthToken = user.oauth_access_token;
                            console.log('We will try to use the existing token :'+odoo.gdrive_oauthToken);
                            gapi.load('client:auth:picker', this.onAuthApiLoadWithToken);
                        } else {
                            gapi.load('client:auth:picker', this.onAuthApiLoad);
                        }
                    });
                } catch(err) {
                    console.log(err);
                    gapi.load('client:auth:picker', this.onAuthApiLoad);
                }
            }
        },

        onAuthApiLoad: function() {
            var self = this;
            var P = new Model('ir.config_parameter');
            P.call('get_param', ['document.gdrive.client.id']).then(function(id) {
                if (id) {
                    var clientId = id;
                    window.gapi.auth.authorize({
                            'client_id': clientId,
                            'scope': scope,
                            'immediate': true,
                            'include_granted_scopes': true
                        },
                        function(authResult) {
                            if (authResult && !authResult.error) {
                                odoo.gdrive_oauthToken = authResult.access_token;
                                self.openPicker();
                            }
                            else {
                                gapi.auth.authorize({
                                    'client_id' : clientId,
                                    'scope' : scope,
                                    'immediate' : false,
                                    'include_granted_scopes' : true,
                                }, function(authResult) {
                                    if (authResult && !authResult.error) {
                                        odoo.gdrive_oauthToken = authResult.access_token;
                                        self.openPicker();
                                    }
                                    else {
                                        alert("Cannot get authorization token for Google Drive: " + authResult.error_subtype + " - " + authResult.error);
                                    }
                                });
                            }
                        });
                }
                else {
                    console.log("Cannot access parameter 'document.gdrive.client.id' check your configuration");
                }
            });
        },
        
        onAuthApiLoadWithToken: function() {
            var self = this;
            var P = new Model('ir.config_parameter');
            P.call('get_param', ['document.gdrive.client.id']).then(function(id) {
                if (id) {
                    var clientId = id;
                    gapi.client.init({
                        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v2/rest"],
                        clientId: clientId,
                    }).then(function () {
                        gapi.auth.setToken(odoo.gdrive_oauthToken);
                        gapi.auth.authorize({
                                'client_id': clientId,
                                'scope': scope,
                                'immediate': true,
                                'include_granted_scopes': true
                            },
                            function(authResult) {
                                if (authResult && !authResult.error) {
                                    odoo.gdrive_oauthToken = authResult.access_token;
                                    self.openPicker();
                                }
                                else {
                                    gapi.auth.authorize({
                                        'client_id': clientId,
                                        'scope': scope,
                                        'immediate': false,
                                        'include_granted_scopes': true
                                    }, function(authResult) {
                                        if (authResult && !authResult.error) {
                                            odoo.gdrive_oauthToken = authResult.access_token;
                                            self.openPicker();
                                        }
                                        else {
                                            alert("Cannot get authorization token for Google Drive: " + authResult.error_subtype + " - " + authResult.error);
                                        }
                                    });
                                }
                            });
                        });
                }
                else {
                    console.log("Cannot access parameter 'document.gdrive.client.id' check your configuration");
                }
            });
        },

        openPicker: function() {
            var self = this;
            var callback = this.pickerCallback;
            var view = self.getParent();
            var ids = (view.fields_view.type != "form") ? view.groups.get_selection().ids : [view.datarecord.id];
            var context = this.session.user_context;
            var P = new Model('ir.config_parameter');
            P.call('get_param', ['document.gdrive.upload.dir']).then(function(dir) {
                if (odoo.gdrive_oauthToken) {
                    var origin = window.location.protocol + '//' + window.location.host;
                    var picker = new google.picker.PickerBuilder().
                    addView(google.picker.ViewId.DOCS).
                    addView(google.picker.ViewId.RECENTLY_PICKED).
                    enableFeature(google.picker.Feature.MULTISELECT_ENABLED).
                    addView(new google.picker.DocsUploadView().setParent(dir)).
                    setOAuthToken(odoo.gdrive_oauthToken).
                    setLocale('en'). // TODO set local of the user
                    setCallback(callback).
                    setOrigin(origin).
                    build();
                    picker.context = new openerp.web.CompoundContext(context, {
                        'active_ids': ids,
                        'active_id': [ids[0]],
                        'active_model': view.dataset.model,
                    });
                    picker.view = view;
                    picker.setVisible(true);
                }
            }).fail(this.on_select_file_error);    
        },

        redraw: function() {
            var self = this;
            this._super.apply(this, arguments);
            if(self.$el.find('.oe_sidebar_add_attachment').length > 0) {
                self.$el.find('.oe_sidebar_add_attachment').after(QWeb.render('AddGDriveDocumentItem', {
                    widget: self
                }))
                self.$el.find('.oe_file_attachment').attr( "target", "_new" );
                self.$el.find('.oe_sidebar_add_gdrive').on('click', function(e) {
                    self.on_gdrive_doc();
                });
            } else { // WE ARE IN ODOO ENTERPRISE
                self.$el.find('.o_sidebar_add_attachment').after(QWeb.render('AddGDriveDocumentItem', {
                    widget: self
                }))
                self.$el.find('.o_file_attachment').attr( "target", "_new" );
                self.$el.find('.oe_sidebar_add_gdrive').on('click', function(e) {
                    self.on_gdrive_doc();
                });
            }
        },

        pickerCallback: function(data) {
            var url = 'nothing';
            if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
                var docs = data[google.picker.Response.DOCUMENTS]
                var documents = [];
                for (var i = 0; i < docs.length; i++) { 
                    var doc = docs[i];
                    documents.push({
                        name: doc[google.picker.Document.NAME],
                        url: doc[google.picker.Document.EMBEDDABLE_URL] || doc[google.picker.Document.URL]
                    });
                }
                var self = this;
                var model = new Model("ir.attachment.add_gdrive");
                model.call('action_add_gdrive', [documents], {
                    context: this.context
                }).then(function(result) {
                    if (self.view.ViewManager.views[self.view.ViewManager.active_view]) {
                        self.view.ViewManager.views[self.view.ViewManager.active_view].controller.reload();
                    }
                    else {
                        self.view.ViewManager.active_view.controller.reload();
                    } // TODO Check why this API changed in saas-6 ??
                });
            }
        },

        on_select_file_error: function(response) {
            var self = this;
            var msg = _t("Sorry, the attachement could not be imported. Please check your configuration parameters.");
            if (response.data.message) {
                msg += "\n " + _t("Reason:") + response.data.message;
            }
            var params = {
                error: response,
                message: msg
            };
            new Dialog(this, {
                title: _t("Attachement Error Notification"),
                buttons: {
                    Ok: function() {
                        this.parents('.modal').modal('hide');
                    }
                }
            }, $(QWeb.render("CrashManager.warning", params))).open();
        },
    });

    ActionManager = ActionManager.extend({
        ir_actions_act_close_wizard_and_reload_view: function(action, options) {
            if (!this.dialog) {
                options.on_close();
            }
            this.dialog_stop();
            this.inner_widget.views[this.inner_widget.active_view].controller.reload();
            return $.when();
        },
    });

});
