/**
 * @copyright 2006, 2007,2008 Mathieu Jacomy
 *
 * Développeurs : Mathieu Jacomy, Anne L'Hôte
 * 
 *  This file is part of Navicrawler.
 *
 *  Navicrawler is free software; you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation; either version 2 of the License, or
 *  (at your option) any later version.
 *
 *  Navicrawler is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Navicrawler; if not, write to the Free Software
 *  Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 */

///// Initialisation //////////////////////////////////////////////////////////////////
// Instancier les agents

var nc_pref			= new ncAgent_preferences();
var nc_gconnect		= new ncAgent_gephiConnector();
var nc_switch		= new ncAgent_Switcher();
var nc_parasit		= new ncAgent_FirefoxParasite();
var nc_ddp			= new ncAgent_DispatcheurDePages();
var nc_autonav		= new ncAgent_Autonavigator();
var nc_ui			= new ncAgent_HuiManager();
var nc_parser		= new ncAgent_ParseurDePages();
var nc_io			= new ncAgent_ImportExport();
var nc_mem			= new ncAgent_Memory();
var nc_pageMan		= new ncAgent_PageManager();
var nc_siteMan		= new ncAgent_SiteManager();
var nc_tagMan		= new ncAgent_TagManager();
var nc_heuristiques	= new ncAgent_Heuristiques();
var nc_utils		= new ncAgent_Utilitaires();

function nc_resetAll(){
	nc_mem			= new ncAgent_Memory();
	nc_pageMan		= new ncAgent_PageManager();
	nc_siteMan		= new ncAgent_SiteManager();
	nc_tagMan		= new ncAgent_TagManager();
	nc_autonav		= new ncAgent_Autonavigator();
	nc_heuristiques	= new ncAgent_Heuristiques();
	nc_heuristiques.LoadXML("chrome://broly/content/heuristiques.xml");
	nc_ui.update();
	alert(nc_locale.GetStringFromName("memoryReset"));
}

// Initialiser localisation
var nc_gBundle = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
var nc_locale = nc_gBundle.createBundle("chrome://broly/locale/broly.properties");
//alert(nc_locale.GetStringFromName("testJsLocale"));

// Fabriquer les écouteurs
function ncInit_registerListners() {
	// But de la manoeuvre : n'appeler cet écouteur qu'une seule fois. 
	window.removeEventListener("load", ncInit_registerListners, true);
	nc_parasit.getBrowser().addEventListener("load", ncInit_onBrowserLoad, true);
	nc_parasit.getBrowser().addEventListener("select", ncInit_onChangeTab, true);
}
// Ecouteur de chargement d'une page
function ncInit_onBrowserLoad(aEvent){
	if(nc_switch.NC_is_On()){
		var theTab = nc_parasit.getTab_fromEvent(aEvent);
		var potentialError = true;
		if(theTab.currentURI != null && theTab.currentURI != undefined){
			var uri = ""+theTab.currentURI.spec;
			if( uri != "about:blank" && uri != ""){
				potentialError = !nc_ddp.processPage(theTab);
				//potentialError = false;
			}
	    }
		if(potentialError){
			var tabE = nc_parasit.getTabElement(theTab);
			if(tabE && tabE.hasAttributes() && tabE.getAttribute("isCrawlTab") && tabE.getAttribute("isCrawlTab")=="true") // Page à problème lors d'un crawl : on supprime la tab.
				nc_parasit.getBrowser().removeTab(tabE);
		}
	}
}

// Mise à jour de l'interface à un changement de Tab
function ncInit_onChangeTab(aEvent) {
	if(nc_switch.NC_is_On()){
		var theTab = nc_parasit.getBrowser().getBrowserAtIndex(aEvent.originalTarget.selectedIndex);
		if(theTab.currentURI != null && theTab.currentURI != undefined){
			var uri = theTab.currentURI.spec;
			if( uri != "about:blank" && uri != ""){
				var dmn = theTab.currentURI.host;
				nc_ddp.updateCurrentPage(uri, dmn);
			}
		}
	}
}
// Mettre en route l'écouteur de chargement d'une page.
window.addEventListener("load", ncInit_registerListners, true);

///// Agents //////////////////////////////////////////////////////////////////////////
/**
 * Agent de connexion avec Géphi
 */
function ncAgent_gephiConnector(){
	this.on = false;
	this.onlySites = true;
	this.gPref = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	this.host = null;
	this.port = null;
	this.gephiSocket = null;
	this.switchActivation = function(){
		if(nc_ui.sb.getElementById("nc_live_on").checked){
			this.enable();
		} else {
			this.disable();
		}
	}
	this.switchOnlySites = function(){
		this.onlySites = nc_ui.sb.getElementById("nc_live_onlySites").checked
	}
	this.enable = function(){
		this.on = true;
		this.initSocket();
		if(this.onlySites){
			this.notifyAllExistingSites();
		} else {
			this.notifyAllExistingPages();
		}
	}
	this.disable = function(){
		this.on = false;
	}
	this.notifyAllExistingPages = function(){
		var pages = nc_pageMan.getAllPages();
		var nodeTxt = "";
		var edgeTxt = "";
		for(var p=0; p<pages.length; p++){
			var pageObject = pages[p];
			var url = pageObject.url.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;");
			var id = pageObject.id;
			nodeTxt += "<node id=\""+pageObject.id+"\" label=\""+url+"\"/>";
			for(var i=0; i<pageObject.links.length; i++){
				var link = pageObject.links[i];
				var linkId = nc_pageMan.get(link, nc_parser.getHostFromUrl(link)).id;
				if(linkId>=0 && id!=linkId){
					edgeTxt += "<edge source=\""+id+"\" target=\""+linkId+"\"/>";
				}
			}
		}
		this.newDatas(nodeTxt,edgeTxt);
	}
	this.notifyAllExistingSites = function(){
		var sites = nc_siteMan.sitesArray;
		var nodeTxt = "";
		var edgeTxt = "";
		for(var s=0; s<sites.length; s++){
			var siteObject = sites[s];
			var url = siteObject.label.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;");
			nodeTxt += "<node id=\""+siteObject.id.replace("ncs","")+"\" label=\""+url+"\"/>";
			for(var i=0; i<siteObject.linksTo.length; i++){
				var sto = nc_siteMan.getSite(siteObject.linksTo[i]);
				edgeTxt += "<edge source=\""+siteObject.id.replace("ncs","")+"\" target=\""+sto.id.replace("ncs","")+"\"/>";
			}
		}
		this.newDatas(nodeTxt,edgeTxt);
	}
	this.notifyNewPage = function(pageObject){
		if(this.on && !this.onlySites){
			var url = pageObject.url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
			var id = pageObject.id;
			var nodeTxt = "<node id=\""+pageObject.id+"\" label=\""+url+"\"/>";
			var edgeTxt = "";
			for(var i=0; i<pageObject.links.length; i++){
				var link = pageObject.links[i];
				var linkId = nc_pageMan.get(link, nc_parser.getHostFromUrl(link)).id;
				if(linkId>=0 && id!=linkId){
					edgeTxt += "<edge source=\""+id+"\" target=\""+linkId+"\"/>";
				}
			}
			this.newDatas(nodeTxt,edgeTxt);
		}
	}
	this.notifyNewSite = function(siteObject){
		if(this.on && this.onlySites){
			var nodeTxt = "";
			var edgeTxt = "";
			nodeTxt += "<node id=\""+siteObject.id.replace("ncs","")+"\" label=\""+siteObject.label+"\"/>";
			for(var i=0; i<siteObject.linksTo.length; i++){
				var sto = nc_siteMan.getSite(siteObject.linksTo[i]);
				edgeTxt += "<edge source=\""+siteObject.id.replace("ncs","")+"\" target=\""+sto.id.replace("ncs","")+"\"/>";
			}
			this.newDatas(nodeTxt,edgeTxt);
		}
	}
	this.newDatas = function(nodesTxt, edgesTxt){
		var header = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><gexf xmlns=\"http://www.gephi.org/gexf\">";
		var graph = "<graph><nodes>";
		var mid = "</nodes><edges>";
		var end = "</edges></graph></gexf>";
		
		var res = header+graph+nodesTxt+mid+edgesTxt+end;
		//alert(res);
		this.pushData(res);
	}
	this.initSocket = function(){
		//Get host and port
		this.host = this.gPref.getCharPref("extensions.gephisample.host");
		this.port = this.gPref.getIntPref("extensions.gephisample.port");
		
		//Connect socket
		try {
			netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
			this.gephiSocket = Components.classes["@gephi.org/socket;1"].createInstance(Components.interfaces.nsIGephiSocket);
			
		} catch(e) {
			alert(e);
		}
	}
	this.pushData = function(data){
		try {
			//Get host and port
			this.gephiSocket.createConnection(this.host, this.port);
			this.gephiSocket.pushData(data);
		} catch(e){
			alert(e);
		}
	}
}
 
/**
 * Agent de gestion des préférences
 */ 
function ncAgent_preferences(){
	this.prefs = Components.classes["@mozilla.org/preferences-service;1"].
                    getService(Components.interfaces.nsIPrefService);
	this.getString = function(pname){
		var prefs = this.prefs.getBranch("extensions.broly.");
		return prefs.getComplexValue(pname, Components.interfaces.nsISupportsString).data;
	}
	this.setString = function(pname, value){
		var prefs = this.prefs.getBranch("extensions.broly.");
		prefs.setCharPref(pname, value);
	}
}
/**
 * Le Parasite de Firefox : cet agent sert à obtenir de Firefox diverses informations.
 */ 
function ncAgent_FirefoxParasite(){
	this.getBrowser = function(){
		return document.getElementById("content");
	}
	this.getTab = function(){
		return this.getTab_fromDocument(this.getBrowser());
	}
	this.getTab_fromEvent = function(aEvent){ 
	    return this.getTab_fromDocument(aEvent.originalTarget);  
	}
	this.getTab_fromDocument = function(theDocument){
		var theTabbrowser = this.getBrowser();
	    if (theTabbrowser.mTabbedMode) { 
        	var browserIndex = theTabbrowser.getBrowserIndexForDocument(theDocument); 
        	if (browserIndex == -1){ 
            	//alert("Erreur lors de la détermination de l'onglet"); 
            	return theDocument;
        	} 
        	return theTabbrowser.getBrowserAtIndex(browserIndex); 
    	}
    	//alert("Mode sans onglet"); 
    	return theTabbrowser.selectedBrowser;
	}
	this.getTabElement = function(theTab){
		if(this.getBrowser().mTabbedMode) {
			for(var i=0; i<this.getBrowser().browsers.length; i++){
				if(this.getBrowser().browsers[i]==theTab)
					return this.getBrowser().mTabs[i];
			}
		}
		return null;
	}
	// Cette fonction renvoie la page d'origine en cas de redirection
	this.getReferrer = function(aTab){
		var r = aTab.webNavigation.document.referrer;
		if(r != ""){
			return r; 
		} else {
			return aTab.webNavigation.document.URL;
		}
	}
	// Cette fonction renvoie un Array de toutes les urls ouvertes dans les onglets
	this.getUrls_fromTabs = function(){
		var result = new Array();
		if(this.getBrowser().mTabbedMode) {
			for(var i=0; i<this.getBrowser().browsers.length; i++){
				var url = ""+this.getBrowser().browsers[i].webNavigation.document.location;
				if(result.indexOf(url)<0){
					result.push(url);
				}
			}
		} else {
			result.push(""+this.getBrowser().selectedBrowser.webNavigation.document.location);
		}
		return result;
	}
	this.goToURL = function(url,type){
		//alert("parasit : goto "+url+" \n> "+type);
		try {
			switch (type) {
			case "normal":
				this.getBrowser().loadURI(url, null, null);
				//this.getBrowser().setAttribute("URL_demanded", ""+url);
				break;
			case "tab":
				// this.getBrowser().delayedOpenTab(url);
				setTimeout(function(aTabElt, url) { aTabElt.linkedBrowser.setAttribute("URL_demanded", ""+url); this.getBrowser().selectedTab = aTabElt; }, 0, this.getBrowser().addTab(url), url);
				break;
			}
		} catch(exception) {
			alert(exception);
		}
	}
	this.addEmptyTab = function(){
		//alert("parasit : Add empty Tab");
		this.getBrowser().addTab("about:blank");
	}
	this.closeTab = function(closingUrl){
		if(this.getBrowser().mTabbedMode) {
			for(var i=0; i<this.getBrowser().browsers.length; i++){
				var url = ""+this.getBrowser().browsers[i].webNavigation.document.location;
				if(url==closingUrl){
					this.getBrowser().removeTab(this.getBrowser().mTabs[i]);
				}
			}
		} else {
			alert(nc_locale.GetStringFromName("tabModeAlert"));
		}
	}
	this.closeTab_byDoc = function(aDocument){
		this.getBrowser().removeTab(this.getBrowser().mTabs[this.getBrowser().getBrowserIndexForDocument(aDocument)]);
	}
	this.openCrawlTab = function(url){
		var theTab = this.getBrowser().addTab(url);
		theTab.setAttribute("isCrawlTab", "true");
	}
	this.tabIsCrawl = function(aDocument){
		var tindex = nc_parasit.getBrowser().getBrowserIndexForDocument(aDocument);
		var isCrawlTab = this.getBrowser().mTabs[tindex].getAttribute("isCrawlTab");
		return isCrawlTab=="true";
	}
	this.replaceCrawlTab = function(aDocument, url, msg){
		nc_parasit.getTab_fromDocument(aDocument).loadURI(url);
	}
	this.closeTab0 = function(){
		this.getBrowser().removeTab(this.getBrowser().mTabs[0]);
	}
	this.countCrawlTabs = function(){
		var count = 0;
		if(this.getBrowser().mTabbedMode) {
			for(var i=0; i<this.getBrowser().browsers.length; i++){
				if(this.getBrowser().mTabs[i].getAttribute("isCrawlTab"))
					count++;
			}
		} else {
			alert(nc_locale.GetStringFromName("tabModeAlert"));
		}
		return count;
	}
	this.reloadCrawlingTabs = function(){
		if(this.getBrowser().mTabbedMode) {
			for(var i=0; i<this.getBrowser().browsers.length; i++){
				if(this.getBrowser().mTabs[i].getAttribute("isCrawlTab")){
					this.getBrowser().browsers[i].loadURI(this.getBrowser().browsers[i].webNavigation.document.location);
				}
			}
		} else {
			alert(tabModeAlert);
		}
	}
	this.pushToCurrentTab = function(texte){
		var bindex = this.getBrowser().browsers.length-1;
		var doc = this.getBrowser().browsers[bindex].webNavigation.document;
		var docE = doc.lastChild.lastChild.lastChild;
		var tn = doc.createTextNode(texte);
		docE.appendChild(tn);
	}
}

/**
 * L'interrupteur : cet agent sert à allumer / couper le navicrawler.
 */
function ncAgent_Switcher(){
	this.nc_is_on = false;
	this.ON = function(){
		this.nc_is_on = true;
		window.top.document.getElementById("nc_on_off_picture").setAttribute("src", "chrome://broly/content/nc_on.png");
		window.top.document.getElementById("startCapture-button").setAttribute("label", nc_locale.GetStringFromName("onMessage"));
		// Chargement du fichier XML des heuristiques
		nc_heuristiques.LoadXML("chrome://broly/content/heuristiques.xml");
		nc_parser.load_second_level_domains_list("chrome://broly/content/domains.xml");
	}
	this.OFF = function(){
		nc_ui.sbInitialized = false;
		this.nc_is_on = false;
		window.top.document.getElementById("nc_on_off_picture").setAttribute("src", "chrome://broly/content/nc_off.png");
		window.top.document.getElementById("startCapture-button").setAttribute("label", nc_locale.GetStringFromName("offMessage"));
	}
	this.NC_is_On = function(){
		return this.nc_is_on;
	}
}

/**
 * Le Dispatcheur de Pages : cet agent prend les pages chargées pour les redistribuer aux autres agents.
 */
function ncAgent_DispatcheurDePages(){
	// Traiter une page (typiquement, qui vient d'être chargée).
	// NB : le parsage va produire une capsule contenant les données du
	// document-page contenu dans l'onglet. Cette capsule est transformée
	// en objet page plus bas, dans la fonction transformCapsuleToPage.
	this.processPage = function(theTab){
		plog("Process Page");
		var pageDocument	= theTab.webNavigation.document;
		var url				= pageDocument.location;
		var dmn				= nc_parser.getHostFromUrl(url);
		if(dmn!=""){
			nc_parser.parsePagedoc(pageDocument, dmn);
			return true;
		} else {
			// Echec : on revoie "faux" à l'appeleur de la fonction pour traitement de cas particulier
			return false;
		}
	}
	this.processCurrentPage = function(){
		var theTab = nc_parasit.getTab();
		var pageDocument	= theTab.webNavigation.document;
		var url				= pageDocument.location;
		var dmn				= nc_parser.getHostFromUrl(url);
		if(dmn!=""){
			nc_parser.forceParsePagedoc(pageDocument, dmn);
			return true;
		} else {
			// Echec : on revoie "faux" à l'appeleur de la fonction pour traitement de cas particulier
			return false;
		}
	}
	// Cette fonction est appelée par la capsule elle-même à la fin du parsage pour
	// être transformée en objet page.
	this.transformCapsuleToPage = function(capsule, dmn){
		//plog("Transform capsule to page");
		var pageObject		= nc_mem.memorizeCapsuleData(capsule.pageDocument, dmn, capsule);
		var pageDocument	= capsule.pageDocument;
		var url				= pageDocument.location;
		var links			= nc_pageMan.getLinks(pageObject);
		var siteLinks		= nc_pageMan.getLinks_host(pageObject); // Ces liens sont des liens "entre sites" : juste une liste de domaines
		//plog("initialisé");
		// Ajouter une visite à la page;
		nc_mem.visitPage(url);
		//plog("page mémorisée");
		// Si l'url n'est pas la page vide
		if(url != "about:blank" && url != ""){
			if(nc_siteMan.isVisited(dmn)){
				// Site visité : on se contente d'ajouter la page, de créer les sites voisins et d'ajouter les liens intersites
				nc_siteMan.addPage(dmn, url);
				for(var i=0; i<siteLinks.length; i++){
					var siteObject = nc_siteMan.getSite(siteLinks[i]);
					if(siteObject == nc_siteMan.dummySite){
						siteObject = nc_siteMan.createNewSite(siteLinks[i]);
						nc_siteMan.setVoisin(siteLinks[i]);
					}
				}
				nc_siteMan.addLinks(dmn, siteLinks);
			} else if(nc_siteMan.isVoisin(dmn)){
				// Site voisin : Le passer en "visité" et ajouter la page, créer les sites voisins et d'ajouter les liens intersites
				nc_siteMan.setVisited(dmn);
				nc_siteMan.addPage(dmn, url);
				for(var i=0; i<siteLinks.length; i++){
					var siteObject = nc_siteMan.getSite(siteLinks[i]);
					if(siteObject == nc_siteMan.dummySite){
						siteObject = nc_siteMan.createNewSite(siteLinks[i]);
						nc_siteMan.setVoisin(siteLinks[i]);
					}
				}
				nc_siteMan.addLinks(dmn, siteLinks);
			} else if(nc_siteMan.isFrontier(dmn)){
				// Site frontière : on ajoute simplement la page.
				nc_siteMan.addPage(dmn, url);
			} else {
				// Site inconnu : il faut le créer, ajouter la page, créer les sites voisins et d'ajouter les liens intersites
				nc_siteMan.createNewSite(dmn);
				nc_siteMan.setVisited(dmn);
				nc_siteMan.addPage(dmn, url);
				for(var i=0; i<siteLinks.length; i++){
					var siteObject = nc_siteMan.getSite(siteLinks[i]);
					if(siteObject == nc_siteMan.dummySite){
						siteObject = nc_siteMan.createNewSite(siteLinks[i]);
						nc_siteMan.setVoisin(siteLinks[i]);
					}
				}
				nc_siteMan.addLinks(dmn, siteLinks);
			}
			//plog("site/page géré");
			if(nc_parasit.getTab().currentURI.spec == url){
				// Si la page traitée est celle qui est dans l'onglet sélectionné, on update la page courante
				this.updateCurrentPage(url, dmn);
			} else {
				// Sinon, on met juste à jour.
				nc_ui.update();
			}
			//plog("update UI fait");
			// Si la page a été demandée par le crawler, on la lui renvoie.
			if(nc_parasit.tabIsCrawl(pageDocument)){
				nc_autonav.grab(pageDocument);
			}
			nc_gconnect.notifyNewPage(pageObject);
		}
		//plog("Traitement terminé");
	}
	// Afficher les infos pour une url donnée.
	this.updateCurrentPage = function(url, dmn){
		var aPageObject = nc_pageMan.requirePage(url, dmn);
		nc_mem.setCurrentUrl(url);
		nc_ui.update();
	}
}
/**
 * Le Parseur de Pages : cet agent retrouve par exemple les liens dans les pages.
 * En outre, il tient à jour la liste des pages parsées et envoie en mémoire le
 * résultat du parsage.
 * Il est possible de lui demander directement des infos, comme par exemple les liens
 * d'une page. Si la page n'a pas encore été parsée, il le fait automatiquement.
 */
function ncAgent_ParseurDePages(){
	this.slddoc = window.top.document.implementation.createDocument("","", null);
	this.parsedPagedocsArray	= new Array();
	this.pagedocIsParsed = function(pageDocument){
		return (this.parsedPagedocsArray.indexOf(pageDocument.location)>=0);
	}
	this.parsePagedoc = function(pageDocument, dmn){
		if(!this.pagedocIsParsed(pageDocument)){
			this.forceParsePagedoc(pageDocument, dmn);
		}
	}
	this.forceParsePagedoc = function(pageDocument, dmn){
		// Attention, pour suivre la suite du process :
		// C'est la capsule de données, contenant les infos parsées, qui se charge elle-même
		// de les collecter. Lorsque le parsage est terminé, elle demande à l'agent mémoire
		// d'enregistrer les infos. Ce dernier va créer un objet page si besoin est, et pousser
		// les infos de la capsule dans la page...
		// Puis la capsule sera effacée pour gagner de la mémoire.
		var pageCapsule = new ncObject_PageParsingCapsule(pageDocument, dmn);
		
		nc_heuristiques.data.currentSiteProperties=[];
		nc_heuristiques.data.currentEntities=[];	// Clear current for scrapping (in case of several frames)
		this.private_parseFrame(pageDocument, pageCapsule);

		if(!this.pagedocIsParsed(pageDocument)){
			this.parsedPagedocsArray.push(pageDocument.location);
		}
	}
	this.load_second_level_domains_list = function(path){
		nc_parser.slddoc.load(path);
	}
	this.lastURLcache = {url:"", host:"", baseHost:""};
	this.getHostFromUrl = function(url){
		if (url == this.lastURLcache.url) {
			return this.lastURLcache.host;
		} else {
			url = "" + url;
			var slash_count = 0;
			var theHost = "";
			for (var char_id = 0; char_id <= url.length; char_id++) {
				if ("" + url[char_id] == "/") {
					slash_count++;
				}
				if (slash_count > 2) {
					// Au troisième slash trouvé, on tient le domaine.
					theHost = url.substr(0, char_id);
					break;
				}
			}
			if (slash_count < 3) {
				// Si on est allé au bout sans trouver le 3ème slash, l'url est le domaine.
				theHost = "" + url;
				// Il peut tout de même arriver qu'il y ait un slash au bout : l'enlever.
				if (theHost.substring(theHost.length - 1, theHost.length) == "/") {
					theHost = theHost.substring(0, theHost.length - 1);
				}
			}
			if (this.checkHost(theHost)) {
				// Now, check if this host is special :
				if(this.lastURLcache.baseHost == theHost){
					return this.lastURLcache.host;
				} else {
					// Attention, code de cradobourrin (on n'utilise même pas le XML...)
					if (this.slddoc.documentElement.textContent.indexOf(theHost.replace("http://", "")) >= 0) {
						slash_count = 0;
						theHost = "";
						for (var char_id = 0; char_id <= url.length; char_id++) {
							if ("" + url[char_id] == "/") {
								slash_count++;
							}
							if (slash_count > 3) {
								// Au quatrième slash trouvé, on tient le domaine.
								break;
							}
						}
						theHost = url.substr(0, char_id).split("#")[0];
						this.lastURLcache = {
							url: url,
							host: theHost,
							baseHost: theHost
						};
						return theHost;
					}
					else {
						this.lastURLcache = {
							url: url,
							host: theHost,
							baseHost: theHost
						};
						return theHost;
					}
				}
			} else {
				return "";
			}
		}
	}
	this.checkHost = function(host){
		if(host.substring(0, 7)=="http://"){
			return true;
		} else if(host.substring(0, 8)=="https://"){
			return true;
		} else {
			return false;
		}
	}
	
	// Private
	this.private_parseFrame = function(theFrame, pageCapsule){
		pageCapsule.addFrame(theFrame);
		pageCapsule.addLinks(theFrame.links);
		var array = new Array;
		var filtersArray = nc_heuristiques.getFilters(pageCapsule.pageDocument.baseURI);
		for(var i = 0 ; i < filtersArray.length ; i++){
			var filterObj = filtersArray[i];
			f = function(theNode){
				return filterObj.select(theNode, filterObj.condition);
			}
			var fwalker = theFrame.createTreeWalker(theFrame, NodeFilter.SHOW_ELEMENT, f, true);
			// Ici filter est passé en argument dans le cas du setTimeout pour pouvoir accéder à ses attributs
			filterObj.run(fwalker, pageCapsule, filterObj);
		}
		// Parser pour trouver les frames filles
		var walker = theFrame.createTreeWalker(theFrame, NodeFilter.SHOW_ELEMENT, this.private_filterFrames, true);
		setTimeout(this.private_grabFrames, 16, walker, pageCapsule, theFrame);
	}
	this.private_filterFrames = function(theNode){
		if(theNode.contentDocument){
			return NodeFilter.FILTER_ACCEPT;
		} else {
			return NodeFilter.FILTER_SKIP;
		}
	}
	this.private_grabFrames = function(iterator, pageCapsule, theFrame){
		for (var i = 0; i < 50; ++i){
			if (!iterator.nextNode()){
				pageCapsule.frameIsFiltered(theFrame);
				return;
			} else {
				// utiliser "this" au lieu de "nc_parser" génère une erreur. Il faut repasser par l'extérieur...
				nc_parser.private_parseFrame(iterator.currentNode.contentDocument, pageCapsule);
			}
		}
		setTimeout(this.private_grabFrames, 16, iterator, pageCapsule, theFrame);
	}
}
/**
 * L'Autonavigator :
 * Cet agent est capable de piloter Firefox pour naviguer tout seul. Il gère
 * plusieurs onglets simultanés, la profondeur (en pages) et la distance (en sites)
 * ainsi qu'un timing d'attente pour ne pas engorger le réseau (des deux côtés).
 * La profondeur des pages et la distance des sites sont enregistrés indépendamment
 * dans ces deux objets.
 */
function ncAgent_Autonavigator(){
	this.activity = "stop";
	this.maxScrapDepth = 2;
	this.maxDepth = 1;
	this.maxDist = 0;
	this.tabsCount = 1;
	this.tempo = "32ms";
	this.waitingPages = new Array(); // Pages en attente de téléchargement
	this.crawledPages = new Array(); // Pages téléchargées
	this.START = function(){
		if(this.isStopped()){
			nc_ui.sb.getElementById("nc_crawlScrapped").disabled = true;
			/// Mode heuristique ou pas
			var scrapMode = nc_ui.sb.getElementById("nc_crawlScrapped").checked;
			/// Initialisation
			// Reset de la mémoire du crawler
			nc_autonav.waitingPages = new Array();
			nc_autonav.crawledPages = new Array();
			if (scrapMode) {
				// Scrap mode
				nc_heuristiques.setCrawlActive();
				// Obtenir les "points d'entrée"
				var entryUrls = nc_parasit.getUrls_fromTabs();
				for (var ei = 0; ei < entryUrls.length; ei++) {
					var url = entryUrls[ei];
					nc_heuristiques.notifyCrawlable(url, 0);
				}
				for (var i = 0; i < this.tabsCount; i++) {
					if (this.waitingPages.length > 0) {
						var newPage = this.waitingPages.shift();
						nc_parasit.openCrawlTab(newPage);
						this.crawledPages.push("" + newPage);
					}
				}
			} else {
				// Normal mode
				// Obtenir les "points d'entrée"
				var entryUrls = nc_parasit.getUrls_fromTabs();
				// Reset des distances des sites
				nc_siteMan.resetAllDist();
				for (var i = 0; i < entryUrls.length; i++) {
					// Les pages ouvertes ont une profondeur de 0
					nc_pageMan.pushProfToPage(entryUrls[i], nc_parser.getHostFromUrl(entryUrls[i]), 0);
					// Les sites correspondant ont une dist de 0
					nc_siteMan.setDist(nc_parser.getHostFromUrl(entryUrls[i]), 0);
					// On teste les liens pour ajouter des pages à la pile
					this.callLinks(entryUrls[i], nc_parser.getHostFromUrl(entryUrls[i]));
				}
				for (var i = 0; i < this.tabsCount; i++) {
					if (this.waitingPages.length > 0) {
						var newPage = this.waitingPages.shift();
						nc_parasit.openCrawlTab(newPage);
						this.crawledPages.push("" + newPage);
					}
				}
			}
		} else {
			/// Reprise
			nc_parasit.reloadCrawlingTabs();
		}
		
		this.activity = "play";
		nc_ui.update();
	}
	// Appelle les liens d'une page pour les rajouter dans la pile
	this.callLinks = function(url, dmn){
		// D'abord (ô subtilité) les liens parsés en HOSTS : les pages d'accueil des sites...
		// NB : ces pages ont une profondeur de 0...
		var linksArray = nc_pageMan.getLinks_host(nc_pageMan.get(url, dmn));
		for(var i=0; i<linksArray.length; i++){
			// On ne prend que les URLs en http
			var protocole = linksArray[i].split(":")[0];
			if(protocole == "http"){
				this.planToCrawlIfNeeded(linksArray[i]);
			}
		}
		// Ensuite tous les liens de la page (normal quoi)
		var linksArray = nc_pageMan.getLinks(nc_pageMan.get(url, dmn));
		for(var i=0; i<linksArray.length; i++){
			// On oublie la référence aux balises, de type "http://gaga.com/index#balise".
			var nextUrl = linksArray[i].split("#")[0];
			// On ne prend que les URLs en http
			var protocole = nextUrl.split(":")[0];
			if(protocole == "http"){
				// On oublie différents fichiers comme le pdf etc. pour ne garder que les "pages web" (et les stèmes)
				var urlTerm = nextUrl.split(".").pop();
				urlTerm = urlTerm.substr(0,3);
				if(urlTerm == "htm"
					|| urlTerm == "php"
					|| urlTerm == "asp"
					|| urlTerm == "jsp"
					|| nextUrl.substr(nextUrl.length-1,1) == "/"
				){
					this.planToCrawlIfNeeded(nextUrl);
				}
			}
		}
	}
	// Rajoute une URL ds la pile si c'est pertinent (prof, dist, déjà crawlé, déjà en attente).
	this.planToCrawlIfNeeded = function(url){
		var pageAjoutee = false;
		if(nc_pageMan.getProf(url)<=this.maxDepth){
			if(nc_siteMan.getDist(nc_parser.getHostFromUrl(url))<=this.maxDist){
				// test if url is already crawled
				var pageIsCrawled = this.crawledPages.indexOf(""+url)>=0;
				// test if url is already waiting
				var pageIsWaiting = this.waitingPages.indexOf(""+url)>=0;
				if(!pageIsCrawled && !pageIsWaiting){
					this.waitingPages.push(""+url);
					pageAjoutee = true;
				}
			} else {
				//alert("Dépassement de distance \n"+nc_parser.getHostFromUrl(url)+"\n\t->"+nc_siteMan.getDist(nc_parser.getHostFromUrl(url)));
			}
		} else {
			//alert("Dépassement de profondeur \n"+url+"\n\t->"+nc_pageMan.getProf(url));
		}
		return pageAjoutee;
	}
	this.notifyCrawlable = function(index){
		var url = nc_heuristiques.crawlablesURLs[index];
		if(url.indexOf("http")==0 && nc_heuristiques.crawlablesDepths[index]<=this.maxScrapDepth){
			// test if url is already crawled
			var pageIsCrawled = this.crawledPages.indexOf(""+url)>=0;
			// test if url is already waiting
			var pageIsWaiting = this.waitingPages.indexOf(""+url)>=0;
			if(!pageIsCrawled && !pageIsWaiting){
				this.waitingPages.push(""+url);
			}
		}
	}
	this.grab = function(aPageDocument){
		var url = aPageDocument.location;
		var scrapMode = nc_ui.sb.getElementById("nc_crawlScrapped").checked;
		if (scrapMode) {
			try {
				if (!this.isStopped()) {
					// Normalement la pile s'est remplie toute seule...
					// Si c'est pas fini, on ouvre des pages (en gérant au passage le respect du nombre d'onglets)
					if (this.waitingPages.length > 0) {
						var actualCrawlTabsCount = nc_parasit.countCrawlTabs();
						if (actualCrawlTabsCount <= this.tabsCount) {
							if (this.isStarted()) {
								var newPage = this.waitingPages.shift();
								this.crawledPages.push("" + newPage);
								var tempo = (this.tempo == "32ms") ? (32) : ((this.tempo == "1/4s") ? (250) : ((this.tempo == "1s à 2s") ? (1000 + Math.random() * 1000) : (4000 + Math.random() * 8000)));
								setTimeout(nc_parasit.replaceCrawlTab, tempo, aPageDocument, newPage, null);
								if (actualCrawlTabsCount < this.tabsCount) {
									var newPage = this.waitingPages.shift();
									nc_parasit.openCrawlTab(newPage);
									this.crawledPages.push("" + newPage);
								}
							}
						} else {
							nc_parasit.closeTab_byDoc(aPageDocument);
							setTimeout(nc_autonav.testCrawlFinished, 32);
						}
					} else {
						nc_parasit.closeTab_byDoc(aPageDocument);
						setTimeout(nc_autonav.testCrawlFinished, 32);
					}
				} else {
					// Arrêt manuel
					nc_parasit.closeTab_byDoc(aPageDocument);
					setTimeout(nc_autonav.testCrawlFinished, 32);
				}
			} catch (erreur) {
				//alert(erreur);
			}
		} else {
			try {
				if (!this.isStopped()) {
					// Appeler les liens pour les mettre dans la pile à crawler si besoin
					this.callLinks("" + url, nc_parser.getHostFromUrl("" + url));
					// Si c'est pas fini, on ouvre des pages (en gérant au passage le respect du nombre d'onglets)
					if (this.waitingPages.length > 0) {
						var actualCrawlTabsCount = nc_parasit.countCrawlTabs();
						if (actualCrawlTabsCount <= this.tabsCount) {
							if (this.isStarted()) {
								var newPage = this.waitingPages.shift();
								this.crawledPages.push("" + newPage);
								var tempo = (this.tempo == "32ms") ? (32) : ((this.tempo == "1/4s") ? (250) : ((this.tempo == "1s à 2s") ? (1000 + Math.random() * 1000) : (4000 + Math.random() * 8000)));
								setTimeout(nc_parasit.replaceCrawlTab, tempo, aPageDocument, newPage, null);
								if (actualCrawlTabsCount < this.tabsCount) {
									var newPage = this.waitingPages.shift();
									nc_parasit.openCrawlTab(newPage);
									this.crawledPages.push("" + newPage);
								}
							}
						} else {
							nc_parasit.closeTab_byDoc(aPageDocument);
							setTimeout(nc_autonav.testCrawlFinished, 32);
						}
					} else {
						nc_parasit.closeTab_byDoc(aPageDocument);
						setTimeout(nc_autonav.testCrawlFinished, 32);
					}
				} else {
					// Arrêt manuel
					nc_parasit.closeTab_byDoc(aPageDocument);
					setTimeout(nc_autonav.testCrawlFinished, 32);
				}
			} catch (erreur) {
			//alert(erreur);
			}
		}
	}
	this.testCrawlFinished = function(){
		if(nc_parasit.countCrawlTabs()==0){
			nc_autonav.STOP();
			if(nc_ui.sb.getElementById("nc_crawlScrapped").checked) {
				nc_heuristiques.setCrawlInactive();
			}
			nc_ui.sb.getElementById("nc_crawlScrapped").disabled = false;
			alert(nc_locale.GetStringFromName("Crawl.endMsg"));
		}
	}
	this.PAUSE = function(){
		this.activity = "pause";
		nc_ui.update();
	}
	this.STOP = function(){
		this.activity = "stop";
		nc_ui.update();
	}
	this.isStarted = function(){
		return (this.activity=="play");
	}
	this.isPaused = function(){
		return (this.activity=="pause");
	}
	this.isStopped = function(){
		return (this.activity=="stop");
	}
	this.setScrapDepth = function(depth){
		this.maxScrapDepth = depth;
		nc_ui.update();
	}
	this.getScrapDepth = function(){
		return this.maxScrapDepth;
	}
	this.setDepth = function(depth){
		this.maxDepth = depth;
		nc_ui.update();
	}
	this.getDepth = function(){
		return this.maxDepth;
	}
	this.setDist = function(distance){
		this.maxDist = distance;
		nc_ui.update();
	}
	this.getDist = function(){
		return this.maxDist;
	}
	this.setTabsCount = function(tabsCount){
		this.tabsCount = tabsCount;
		nc_ui.update();
	}
	this.getTabsCount = function(){
		return this.tabsCount;
	}
	this.setTempo = function(tempo){
		this.tempo = tempo;
		nc_ui.update();
	}
	this.getTempo = function(){
		return this.tempo;
	}
	this.getWaitingPagesCount = function(){
		return this.waitingPages.length;
	}
}
/**
 * Gestionnaire de libellés :
 * Cet agent s'occupe des libellés des sites.
 */
function ncAgent_TagManager(){
	this.libellesArray = [];
	this.groupes = ["Independant"];
	this.ajouter = function(){
		// var nom = nc_ui.getTagToAdd().trim();
		var nom = nc_ui.getTagToAdd();
		if(nom != "")
			this.ajouterLibelle(nom);
	}
	this.cleanLibelleText = function(lname){
		cleanName = lname;
		//cleanName = cleanName.toLowerCase();
		cleanName = cleanName.replace(/[àâä]/gi, "a");
		cleanName = cleanName.replace(/[éè&êë]/gi, "e");
		cleanName = cleanName.replace(/[îï]/gi, "i");
		cleanName = cleanName.replace(/[ôö]/gi, "o");
		cleanName = cleanName.replace(/[ùûü]/gi, "u");
		cleanName = cleanName.replace(/[ç]/gi, "c");
		cleanName = cleanName.replace(/[^abcdefghijklmnopqrstuvwxyz_0123456789]/gi, "_");
		cleanName = cleanName.replace(/_+/g, "_");
		return cleanName;
	}
	this.grouper = function(){
		var nom = nc_ui.getGroupToAdd();
		this.ajouterGroupe(nom);
	}
	this.ajouterLibelle = function(nom){
		var lmd5 = hex_md5(nom);
		if(!this.alreadyExists(nom)){
			this.libellesArray.push({nom:nom, lmd5:lmd5, connexions:[], groupe:0});
			this.reordonneLibelles();
			nc_ui.update();
		}
	}
	this.ajouterGroupe = function(nom){
		var gindex = this.groupes.indexOf(nom);
		if(gindex<0){
			this.groupes.push(""+nom);
			gindex = this.groupes.indexOf(nom);
			nc_ui.update();
		}
		return gindex;
	}
	this.reordonneLibelles = function(){
		var temp_libelles = [];
		for(var g = 0; g<this.groupes.length; g++){
			for(var l=0; l<this.libellesArray.length; l++){
				var libelle = this.libellesArray[l];
				if(""+libelle.groupe == ""+g){
					temp_libelles.push(libelle);
				}
			}
		}
		this.libellesArray = temp_libelles;
	}
	this.alreadyExists = function(nom){
		for(var i=0; i<this.libellesArray.length; i++){
			if(this.libellesArray[i].nom==nom)
				return true;
		}
		return false;
	}
	this.getList = function(){
		return this.libellesArray;
	}
	this.getGroupes = function(){
		return this.groupes;
	}
	this.getSiteState = function(lmd5, dmn){
		// 0 : non-attribué
		// 1 : Oui
		// 2 : Non
		// 3 : Reporté
		var lindex = this.private_getIndex(lmd5);
		if(lindex>=0){
			var connexions = this.libellesArray[lindex].connexions;
			for(var i=0; i<connexions.length; i++){
				var c = connexions[i];
				if(c.site==dmn){
					return c.etat;
				}
			}
		}
		return 0;
	}
	this.setSiteState = function(lmd5, dmn, etat){
		// verif état conforme
		if(etat==1 || etat==2 || etat==3){
			// index du libellé ciblé
			var lindex = this.private_getIndex(lmd5);
			if(lindex>=0){
				// Enregistrer l'état du site pour le libellé (dans connexions)
				this.private_setSiteState(lmd5, dmn, etat, lindex);
				// Gestion des groupes :
				// Attention : le groupe '0' n'est pas un groupe !!!
				if(""+this.libellesArray[lindex].groupe!="0"){
					if(etat==1){
						for(var l=0; l<this.libellesArray.length; l++){
							if(l!=lindex && ""+this.libellesArray[l].groupe==""+this.libellesArray[lindex].groupe){
								// Si on passe à 'oui', tous les autres libellés du même groupe sont à 'non'
								this.private_setSiteState(this.libellesArray[l].lmd5, dmn, 2, l);
							}
						}
					} else if(etat==3){
						for(var l=0; l<this.libellesArray.length; l++){
							if(l!=lindex && ""+this.libellesArray[l].groupe==""+this.libellesArray[lindex].groupe){
								// Si on passe à 'oui', tous les autres libellés du même groupe sont à 'non'
								this.private_setSiteState(this.libellesArray[l].lmd5, dmn, 3, l);
							}
						}
					}
				}
			}
		}
		nc_ui.update();
	}
	this.private_setSiteState = function(lmd5, dmn, etat, lindex){
		var connexions = this.libellesArray[lindex].connexions;
		if(this.getSiteState(lmd5, dmn)==0){
			// Ajouter
			connexions.push({site:dmn, etat:etat});
		} else {
			// Mettre à jour
			for(var i=0; i<connexions.length; i++){
				var c = connexions[i];
				if(c.site==dmn){
					c.etat = etat;
				}
			}
		}
	}
	this.setLibelleGroupe = function(lmd5, groupe){
		//alert("Set libellé groupe : \n"+lmd5+"\ngroupe "+groupe);
		var lindex = this.private_getIndex(lmd5);
		this.libellesArray[lindex].groupe = groupe;
		this.reordonneLibelles();
		nc_ui.update();
	}
	this.private_getIndex = function(lmd5){
		for(var i=0; i<this.libellesArray.length; i++){
			if(this.libellesArray[i].lmd5 == lmd5)
				return i;
		}
		return -1;
	}
}
/**
 * Gestionnaire d'interface utilisateur :
 * Cet agent se charge de gérer l'interface. A partir des fichiers XUL (l'overlay
 * et le fichier de la sidebar) il remplit les champ. La fonction centrale, update,
 * est appelée lorsque les données ont changé pour mettre à jour les données affichées.
 */
function ncAgent_HuiManager(){
	this.sb = null;
	this.sbInitialized = false;
	this.tableauChoisi = "";
	this.progressSteps = 100;
	this.progressSteps_done = 0;
	this.currentHH = {site:"none", date:"none"};
	this.update = function(){
		//plog("update ui");
		if(!this.sbInitialized){
			this.private_initializeSb();
			this.configTabs();
			//plog("initialisation de l'interface effectuée");
		}
		if(this.sb.getElementById("nc_nav_tab").selected){
			this.updateNavInfo();
			//plog("updateNavInfo fait");
		} else if(this.sb.getElementById("nc_class_tab").selected){
			this.updateTagInfo();
			//plog("updateCrawlInfo fait");
		} else if(this.sb.getElementById("nc_bot_tab").selected){
			this.updateCrawlInfo();
			//plog("updateTagInfo fait");
		} else if(this.sb.getElementById("nc_heurisitques_tab").selected){
			this.updateHeurInfo();
			//plog("updateHeurInfo fait");
		}
	}
	this.updateNavInfo = function(){
		// Enregister la position de la scrollbox
		var listIndex = this.sb.getElementById("nc_navList").getIndexOfFirstVisibleRow();
		//plog("update nav info");
		///// Informations sur la page
		// Url
		var urlText = ""+nc_mem.getCurrentUrl();
		if (urlText.length >= 47){
			urlText = urlText.substring(0, 46)+"...";
		}
		this.sb.getElementById("nc_currentUrl").value = urlText;
		//plog("navui: url fait");
		// Page déjà visitée
		if(nc_mem.getCurrent_visitCount()>1) {
			this.sb.getElementById("nc_deja_visitee_label").setAttribute("value", nc_locale.GetStringFromName("yes"));
			this.sb.getElementById("nc_deja_visitee_label").setAttribute("style", "font-size:12px; font-weight:bold; background-color: #FFF; color:#0A0;");
		} else {
			this.sb.getElementById("nc_deja_visitee_label").setAttribute("value", nc_locale.GetStringFromName("no"));
			this.sb.getElementById("nc_deja_visitee_label").setAttribute("style", "font-size:12px; font-weight:bold; background-color: #FFF; color:#A00;");
		}
		//plog("navui: page visitée fait");
		// Drapeau
		if(nc_mem.getCurrentFlag()){
			this.sb.getElementById("nc_flag_page_image").setAttribute("src", "chrome://broly/content/flag_on.png");
			this.sb.getElementById("nc_flag_page_label").setAttribute("value", nc_locale.GetStringFromName("flaggedPage"));
			this.sb.getElementById("nc_flag_page_button").setAttribute("label", nc_locale.GetStringFromName("flaggedPageButton"));
		} else {
			this.sb.getElementById("nc_flag_page_image").setAttribute("src", "chrome://broly/content/flag_off.png");
			this.sb.getElementById("nc_flag_page_label").setAttribute("value", nc_locale.GetStringFromName("unflaggedPage"));
			this.sb.getElementById("nc_flag_page_button").setAttribute("label", nc_locale.GetStringFromName("unflaggedPageButton"));
		}
		plog("navui: drapeau fait");
		// Liens sortants
		this.sb.getElementById("nc_liens_sortants_label").value = nc_mem.getCurrentLinks().length;
		//plog("navui: liens sortants fait");
		// Profondeur
		this.sb.getElementById("nc_profondeur_label").value = nc_mem.getCurrentProf();
		//plog("navui: profondeur fait");
		///// Informations sur le site
		this.sb.getElementById("nc_currentDmn").value = nc_mem.getCurrentDomain();
		//plog("navui: informations site fait");
		// Pages visitées
		this.sb.getElementById("nc_pages_visitees_label").value = nc_siteMan.getPages(nc_mem.getCurrentDomain()).length;
		//plog("navui: pages visitées fait");
		// Pages repérées
		this.sb.getElementById("nc_pages_reperees_label").value = nc_siteMan.getPages_flag(nc_mem.getCurrentDomain()).length;
		//plog("navui: pages repérées fait");
		// Sites référeurs
		this.sb.getElementById("nc_sites_refereurs_label").value = nc_siteMan.getLinksFrom(nc_mem.getCurrentDomain()).length+" =>X";
		//plog("navui: sites référeurs fait");
		// Sites cités
		this.sb.getElementById("nc_sites_cites_label").value = "X=> "+nc_siteMan.getLinksTo(nc_mem.getCurrentDomain()).length;
		//plog("navui: sites cités fait");
		// Visité / Frontière
		if(nc_mem.getCurrentSiteVisited()){
			this.sb.getElementById("nc_switch_site_state_image").setAttribute("src", "chrome://broly/content/light_green.png");
			this.sb.getElementById("nc_switch_site_state_label").setAttribute("value", nc_locale.GetStringFromName("visitedLabel"));
			this.sb.getElementById("nc_switch_site_state_button").setAttribute("label", nc_locale.GetStringFromName("visitedButton"));
		} else {
			this.sb.getElementById("nc_switch_site_state_image").setAttribute("src", "chrome://broly/content/light_red.png");
			this.sb.getElementById("nc_switch_site_state_label").setAttribute("value", nc_locale.GetStringFromName("frontierLabel"));
			this.sb.getElementById("nc_switch_site_state_button").setAttribute("label", nc_locale.GetStringFromName("frontierButton"));			
		}
		plog("navui: visité/frontière fait");
		///// Informations sur la session
		this.sb.getElementById("nc_sites_visited_label").value = nc_siteMan.getVisitedCount();
		//plog("navui: sites visités OK");
		this.sb.getElementById("nc_sites_voisin_label").value = nc_siteMan.getVoisinCount();
		//plog("navui: sites voisins OK");
		this.sb.getElementById("nc_sites_frontier_label").value = nc_siteMan.getFrontierCount();
		//plog("navui: sites frontières OK");
		///// Tableau des données choisies
		if(this.tableauChoisi == "deja_visitee"){
			this.showTable_deja_visitee();
		} else if(this.tableauChoisi == "liens_sortants"){
			this.showTable_liens_sortants();
		} else if(this.tableauChoisi == "pages_visitees"){
			this.showTable_pages_visitees();
		} else if(this.tableauChoisi == "pages_reperees"){
			this.showTable_pages_reperees();
		} else if(this.tableauChoisi == "sites_refereurs"){
			this.showTable_sites_refereurs();
		} else if(this.tableauChoisi == "sites_cites"){
			this.showTable_sites_cites();
		} else if(this.tableauChoisi == "sites_visited"){
			this.showTable_sites_visited();
		} else if(this.tableauChoisi == "sites_voisin"){
			this.showTable_sites_voisin();
		} else if(this.tableauChoisi == "sites_frontier"){
			this.showTable_sites_frontier();
		}
		// Remettre la listbox au bon index
		listIndex = this.sb.getElementById("nc_navList").getRowCount()
					- this.sb.getElementById("nc_navList").getNumberOfVisibleRows()
					- Math.max(
						this.sb.getElementById("nc_navList").getRowCount()
						- listIndex
						- this.sb.getElementById("nc_navList").getNumberOfVisibleRows(),
					0);
		this.sb.getElementById("nc_navList").scrollToIndex(listIndex);
		//plog("navui: tableau de données fait");
	}
	this.sortNavTable = function(){
		if(this.tableauChoisi == "deja_visitee"){
			nc_siteMan.getSite(nc_mem.getCurrentDomain()).pages.sort();
		} else if(this.tableauChoisi == "liens_sortants"){
			nc_pageMan.get(nc_mem.currentUrl, nc_mem.getCurrentDomain()).links.sort();
		} else if(this.tableauChoisi == "pages_visitees"){
			nc_siteMan.getSite(nc_mem.getCurrentDomain()).pages.sort();
		} else if(this.tableauChoisi == "pages_reperees"){
			nc_siteMan.getSite(nc_mem.getCurrentDomain()).pages.sort();
		} else if(this.tableauChoisi == "sites_refereurs"){
			nc_siteMan.getSite(nc_mem.getCurrentDomain()).linksFrom.sort();
		} else if(this.tableauChoisi == "sites_cites"){
			nc_siteMan.getSite(nc_mem.getCurrentDomain()).linksTo.sort();
		} else if(this.tableauChoisi == "sites_visited"){
			nc_siteMan.sort();
		} else if(this.tableauChoisi == "sites_voisin"){
			nc_siteMan.sort();
		} else if(this.tableauChoisi == "sites_frontier"){
			nc_siteMan.sort();
		}
		this.update();
		//alert("sort "+this.tableauChoisi);
	}
	this.findNavTable = function(){
		var lb = this.sb.getElementById("nc_navList");
		if (lb.childNodes.length > 0) {
			//alert("find "+this.sb.getElementById("nc_navList_find_box").value+" in "+this.sb.getElementById("nc_navList").childNodes.length+" elements");
			//alert(lb.currentIndex);
			var template = this.sb.getElementById("nc_navList_find_box").value;
			var current = lb.currentIndex + 1;
			if(current>=lb.childNodes.length)
				current = 0;
			// Init
			var i = current;
			var item = lb.childNodes[i].getAttribute("label");
			var matches = item.match(template)!=null;
			if(matches){
				lb.scrollToIndex(i);
				lb.selectItem(lb.childNodes[i]);				
			} else {
				i++;
				if(i>=lb.childNodes.length)
					i = 0;
				while(i != current){
					item = lb.childNodes[i].getAttribute("label");
					matches = item.match(template)!=null;
					if (matches) {
						lb.scrollToIndex(i);
						lb.selectItem(lb.childNodes[i]);
						break;
					} else {
						i++;
						if(i>=lb.childNodes.length)
							i = 0;
					}
				}
			}
		}
	}
	// Cette fonction sert à implémenter l'interface de la section Robot-crawler.
	// Comme les fonctions et images dépendent de l'état du crawler (play stop ou pause), il faut les mettre à jour
	// lorsque l'état du crawler change. C'est pourquoi la fonction est baptisée "update" et non "make" comme pour
	// l'onglet général.
	this.updateCrawlInfo = function(){
		///// Boutons de commande
		if(nc_autonav.isStopped()){
			///// Robot à l'arrêt
			// Interface graphique
			this.sb.getElementById("nc_robot_play_img").setAttribute("src", "chrome://broly/content/bouton_play_off.png");
			this.sb.getElementById("nc_robot_play_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_robot_play_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_play_off_over.png\");");		
			this.sb.getElementById("nc_robot_play_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_robot_play_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_play_off.png\");");		
			this.sb.getElementById("nc_robot_pause_img").setAttribute("src", "chrome://broly/content/bouton_pause_off.png");
			this.sb.getElementById("nc_robot_pause_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_robot_pause_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_pause_off_over.png\");");		
			this.sb.getElementById("nc_robot_pause_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_robot_pause_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_pause_off.png\");");		
			this.sb.getElementById("nc_robot_stop_img").setAttribute("src", "chrome://broly/content/bouton_stop_on.png");
			this.sb.getElementById("nc_robot_stop_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_robot_stop_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_stop_on_over.png\");");		
			this.sb.getElementById("nc_robot_stop_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_robot_stop_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_stop_on.png\");");		
			// Fonctions
			this.sb.getElementById("nc_robot_play_box").setAttribute("onclick", "window.top.nc_autonav.START();");		
			this.sb.getElementById("nc_robot_pause_box").setAttribute("onclick", "window.top.nc_autonav.PAUSE();");		
			this.sb.getElementById("nc_robot_stop_box").setAttribute("onclick", "window.top.nc_autonav.STOP();");		
		} else if(nc_autonav.isPaused()){
			///// Robot mis en pause
			// Interface graphique
			this.sb.getElementById("nc_robot_play_img").setAttribute("src", "chrome://broly/content/bouton_play_off.png");
			this.sb.getElementById("nc_robot_play_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_robot_play_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_play_off_over.png\");");		
			this.sb.getElementById("nc_robot_play_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_robot_play_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_play_off.png\");");		
			this.sb.getElementById("nc_robot_pause_img").setAttribute("src", "chrome://broly/content/bouton_pause_on.png");
			this.sb.getElementById("nc_robot_pause_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_robot_pause_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_pause_on_over.png\");");		
			this.sb.getElementById("nc_robot_pause_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_robot_pause_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_pause_on.png\");");		
			this.sb.getElementById("nc_robot_stop_img").setAttribute("src", "chrome://broly/content/bouton_stop_off.png");
			this.sb.getElementById("nc_robot_stop_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_robot_stop_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_stop_off_over.png\");");		
			this.sb.getElementById("nc_robot_stop_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_robot_stop_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_stop_off.png\");");		
			// Fonctions
			this.sb.getElementById("nc_robot_play_box").setAttribute("onclick", "window.top.nc_autonav.START();");		
			this.sb.getElementById("nc_robot_pause_box").setAttribute("onclick", "window.top.nc_autonav.PAUSE();");		
			this.sb.getElementById("nc_robot_stop_box").setAttribute("onclick", "window.top.nc_autonav.STOP();");		
		} else {
			///// Robot en marche
			// Interface graphique
			this.sb.getElementById("nc_robot_play_img").setAttribute("src", "chrome://broly/content/bouton_play_on.png");
			this.sb.getElementById("nc_robot_play_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_robot_play_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_play_on_over.png\");");		
			this.sb.getElementById("nc_robot_play_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_robot_play_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_play_on.png\");");		
			this.sb.getElementById("nc_robot_pause_img").setAttribute("src", "chrome://broly/content/bouton_pause_off.png");
			this.sb.getElementById("nc_robot_pause_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_robot_pause_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_pause_off_over.png\");");		
			this.sb.getElementById("nc_robot_pause_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_robot_pause_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_pause_off.png\");");		
			this.sb.getElementById("nc_robot_stop_img").setAttribute("src", "chrome://broly/content/bouton_stop_off.png");
			this.sb.getElementById("nc_robot_stop_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_robot_stop_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_stop_off_over.png\");");		
			this.sb.getElementById("nc_robot_stop_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_robot_stop_img\").setAttribute(\"src\", \"chrome://broly/content/bouton_stop_off.png\");");		
			// Fonctions
			this.sb.getElementById("nc_robot_play_box").setAttribute("onclick", "window.top.nc_autonav.START();");		
			this.sb.getElementById("nc_robot_pause_box").setAttribute("onclick", "window.top.nc_autonav.PAUSE();");		
			this.sb.getElementById("nc_robot_stop_box").setAttribute("onclick", "window.top.nc_autonav.STOP();");		
		}
		///// Crawl heuristique activé ou non
		var scrapCrawlActive = this.sb.getElementById("nc_crawlScrapped").checked;
		if (scrapCrawlActive) {
			///// Boutons de paramètres
			// Profondeur Heuristique
			var scrapProfBox = this.sb.getElementById("nc_scrapDepth_box");
			for (var i = 0; i < scrapProfBox.childNodes.length; i++) {
				var scrapProfItem = scrapProfBox.childNodes[i];
				var scrapProfValue = scrapProfItem.childNodes[1].getAttribute("value");
				if ("" + scrapProfValue == "" + nc_autonav.getScrapDepth()) {
					scrapProfItem.setAttribute("style", "margin: 3px; border:5px solid #333; font-size: 10px; background-color:#FFF;");
					scrapProfItem.setAttribute("onmouseover", "");
					scrapProfItem.setAttribute("onmouseout", "");
					scrapProfItem.setAttribute("onclick", "");
				}
				else {
					scrapProfItem.setAttribute("style", "margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;");
					scrapProfItem.setAttribute("onmouseover", "window.document.getElementById(\"" + scrapProfItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #FF0; font-size: 10px; background-color:#FF0;\");");
					scrapProfItem.setAttribute("onmouseout", "window.document.getElementById(\"" + scrapProfItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;\");");
					scrapProfItem.setAttribute("onclick", "window.top.nc_autonav.setScrapDepth(" + scrapProfValue + ");");
				}
			}
			// Profondeur
			var profBox = this.sb.getElementById("nc_depth_box");
			for (var i = 0; i < profBox.childNodes.length; i++) {
				var profItem = profBox.childNodes[i];
				var profValue = profItem.childNodes[1].getAttribute("value");
				if ("" + profValue == "" + nc_autonav.getDepth()) {
					profItem.setAttribute("style", "margin: 3px; border:5px solid #999; font-size: 10px; background-color:#BBB;");
					profItem.setAttribute("onmouseover", "");
					profItem.setAttribute("onmouseout", "");
					profItem.setAttribute("onclick", "");
				}
				else {
					profItem.setAttribute("style", "margin: 3px; border:5px solid #BBB; font-size: 10px; background-color:#BBB;");
					profItem.setAttribute("onmouseover", "");
					profItem.setAttribute("onmouseout", "");
					profItem.setAttribute("onclick", "");
				}
			}
			// Distance
			var distBox = this.sb.getElementById("nc_dist_box");
			for (var i = 0; i < distBox.childNodes.length; i++) {
				var distItem = distBox.childNodes[i];
				var distValue = distItem.childNodes[1].getAttribute("value");
				if ("" + distValue == "" + nc_autonav.getDist()) {
					distItem.setAttribute("style", "margin: 3px; border:5px solid #999; font-size: 10px; background-color:#BBB;");
					distItem.setAttribute("onmouseover", "");
					distItem.setAttribute("onmouseout", "");
					distItem.setAttribute("onclick", "");
				}
				else {
					distItem.setAttribute("style", "margin: 3px; border:5px solid #BBB; font-size: 10px; background-color:#BBB;");
					distItem.setAttribute("onmouseover", "");
					distItem.setAttribute("onmouseout", "");
					distItem.setAttribute("onclick", "");
				}
			}
		} else {
			///// Boutons de paramètres
			// Profondeur Heuristique
			var scrapProfBox = this.sb.getElementById("nc_scrapDepth_box");
			for (var i = 0; i < scrapProfBox.childNodes.length; i++) {
				var scrapProfItem = scrapProfBox.childNodes[i];
				var scrapProfValue = scrapProfItem.childNodes[1].getAttribute("value");
				if ("" + scrapProfValue == "" + nc_autonav.getScrapDepth()) {
					scrapProfItem.setAttribute("style", "margin: 3px; border:5px solid #999; font-size: 10px; background-color:#BBB;");
					scrapProfItem.setAttribute("onmouseover", "");
					scrapProfItem.setAttribute("onmouseout", "");
					scrapProfItem.setAttribute("onclick", "");
				}
				else {
					scrapProfItem.setAttribute("style", "margin: 3px; border:5px solid #BBB; font-size: 10px; background-color:#BBB;");
					scrapProfItem.setAttribute("onmouseover", "");
					scrapProfItem.setAttribute("onmouseout", "");
					scrapProfItem.setAttribute("onclick", "");
				}
			}
			// Profondeur
			var profBox = this.sb.getElementById("nc_depth_box");
			for (var i = 0; i < profBox.childNodes.length; i++) {
				var profItem = profBox.childNodes[i];
				var profValue = profItem.childNodes[1].getAttribute("value");
				if ("" + profValue == "" + nc_autonav.getDepth()) {
					profItem.setAttribute("style", "margin: 3px; border:5px solid #333; font-size: 10px; background-color:#FFF;");
					profItem.setAttribute("onmouseover", "");
					profItem.setAttribute("onmouseout", "");
					profItem.setAttribute("onclick", "");
				}
				else {
					profItem.setAttribute("style", "margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;");
					profItem.setAttribute("onmouseover", "window.document.getElementById(\"" + profItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #FF0; font-size: 10px; background-color:#FF0;\");");
					profItem.setAttribute("onmouseout", "window.document.getElementById(\"" + profItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;\");");
					profItem.setAttribute("onclick", "window.top.nc_autonav.setDepth(" + profValue + ");");
				}
			}
			// Distance
			var distBox = this.sb.getElementById("nc_dist_box");
			for (var i = 0; i < distBox.childNodes.length; i++) {
				var distItem = distBox.childNodes[i];
				var distValue = distItem.childNodes[1].getAttribute("value");
				if ("" + distValue == "" + nc_autonav.getDist()) {
					distItem.setAttribute("style", "margin: 3px; border:5px solid #333; font-size: 10px; background-color:#FFF;");
					distItem.setAttribute("onmouseover", "");
					distItem.setAttribute("onmouseout", "");
					distItem.setAttribute("onclick", "");
				}
				else {
					distItem.setAttribute("style", "margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;");
					distItem.setAttribute("onmouseover", "window.document.getElementById(\"" + distItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #FF0; font-size: 10px; background-color:#FF0;\");");
					distItem.setAttribute("onmouseout", "window.document.getElementById(\"" + distItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;\");");
					distItem.setAttribute("onclick", "window.top.nc_autonav.setDist(" + distValue + ");");
				}
			}
		}
		// Nombre d'onglets
		var tabsBox = this.sb.getElementById("nc_tabs_box");
		for (var i = 0; i < tabsBox.childNodes.length; i++) {
			var tabsItem = tabsBox.childNodes[i];
			var tabsValue = tabsItem.childNodes[1].getAttribute("value");
			if ("" + tabsValue == "" + nc_autonav.getTabsCount()) {
				tabsItem.setAttribute("style", "margin: 3px; border:5px solid #333; font-size: 10px; background-color:#FFF;");
				tabsItem.setAttribute("onmouseover", "");
				tabsItem.setAttribute("onmouseout", "");
				tabsItem.setAttribute("onclick", "");
			}
			else {
				tabsItem.setAttribute("style", "margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;");
				tabsItem.setAttribute("onmouseover", "window.document.getElementById(\"" + tabsItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #FF0; font-size: 10px; background-color:#FF0;\");");
				tabsItem.setAttribute("onmouseout", "window.document.getElementById(\"" + tabsItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;\");");
				tabsItem.setAttribute("onclick", "window.top.nc_autonav.setTabsCount(" + tabsValue + ");");
			}
		}
		// Intervalles de chargement
		var tempoBox = this.sb.getElementById("nc_tempo_box");
		for (var i = 0; i < tempoBox.childNodes.length; i++) {
			var tempoItem = tempoBox.childNodes[i];
			var tempoValue = "" + tempoItem.childNodes[1].getAttribute("value");
			if ("" + tempoValue == "" + nc_autonav.getTempo()) {
				tempoItem.setAttribute("style", "margin: 3px; border:5px solid #333; font-size: 10px; background-color:#FFF;");
				tempoItem.setAttribute("onmouseover", "");
				tempoItem.setAttribute("onmouseout", "");
				tempoItem.setAttribute("onclick", "");
			}
			else {
				tempoItem.setAttribute("style", "margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;");
				tempoItem.setAttribute("onmouseover", "window.document.getElementById(\"" + tempoItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #FF0; font-size: 10px; background-color:#FF0;\");");
				tempoItem.setAttribute("onmouseout", "window.document.getElementById(\"" + tempoItem.id + "\").setAttribute(\"style\", \"margin: 3px; border:5px solid #AAF; font-size: 10px; background-color:#AAF;\");");
				tempoItem.setAttribute("onclick", "window.top.nc_autonav.setTempo(\"" + tempoValue + "\");");
			}
		}
		////// Pages en attente
		this.sb.getElementById("waitingPages_label").setAttribute("value", nc_autonav.getWaitingPagesCount());
	}
	this.updateTagInfo = function(){
		this.sb.getElementById("nc_libelle_poursite").value = nc_locale.GetStringFromName("forTheSite")+nc_mem.getCurrentDomain();
		var container = this.sb.getElementById("nc_libelles_vbox");
		this.domClear(container);
		var groupeActuel = 0;
		for(var i=0; i<nc_tagMan.getList().length; i++){
			// Pour chaque libellé...
			// On collecte les données de base,
			var libelle = nc_tagMan.getList()[i].nom;
			var lmd5 = nc_tagMan.getList()[i].lmd5;
			var groupe = nc_tagMan.getList()[i].groupe;
			var etat = nc_tagMan.getSiteState(lmd5, nc_mem.getCurrentDomain());
			var etat_label = (etat==1)?(nc_locale.GetStringFromName("Tags.yes")):((etat==2)?(nc_locale.GetStringFromName("Tags.no")):((etat==3)?(nc_locale.GetStringFromName("Tags.joker")):(nc_locale.GetStringFromName("Tags.untagged"))));
			var etat_color = (etat==1)?("#0FA"):((etat==2)?("#C39"):((etat==3)?("#99F"):("#CCE")));
			// boîte du libellé
			var tagBox = this.sb.createElement("vbox");
			tagBox.setAttribute("style", "margin:4px 3px 1px 3px;");
			container.appendChild(tagBox);
			// Si le groupe courant a changé, on intercale une étiquette. (les libellés sont toujours classés)
			var groupeNouveau = false;
			if(groupeActuel != groupe){
				groupeNouveau = true;
			}
			groupeActuel = groupe;
			if(groupeNouveau){
				var groupLabel = this.sb.createElement("label");
				groupLabel.setAttribute("style", "margin:5px;border-top:1px solid #AAA");
				groupLabel.setAttribute("value", nc_locale.GetStringFromName("group")+" : \""+nc_tagMan.getGroupes()[groupe]+"\"");
				tagBox.appendChild(groupLabel);
			}
			// On construit les éléments graphiques des libellés
			// Libellé (nom)
			var titleBox = this.sb.createElement("hbox");
			titleBox.setAttribute("flex", "1");
			var tagLabel_tag = this.sb.createElement("label");
			tagLabel_tag.setAttribute("style", "background-color:"+etat_color+";font-weight:bold;font-size:10px;border: 2px solid "+etat_color+";");
			tagLabel_tag.setAttribute("value", "\""+libelle+"\" ");
			titleBox.appendChild(tagLabel_tag);
			var tagLabel_espace = this.sb.createElement("label");
			tagLabel_espace.setAttribute("style", "font-size:10px;margin: 1px;");
			tagLabel_espace.setAttribute("flex", "1");
			tagLabel_espace.setAttribute("value", " ");
			titleBox.appendChild(tagLabel_espace);
			tagBox.appendChild(titleBox);
			// boutons pour l'état
			var buttonBox = this.sb.createElement("hbox");
			tagBox.appendChild(buttonBox);
			// etat
			var preboutons = this.sb.createElement("label");
			preboutons.setAttribute("value", " "+etat_label+" ");
			preboutons.setAttribute("flex", "1");
			preboutons.setAttribute("style", "backgroud-color:#FFF;color:"+etat_color+";border:3px solid "+etat_color+";font-size:9px;font-weight:bold;");
			buttonBox.appendChild(preboutons);
			if(groupe == 0){
				// Si le groupe est 0, ie. groupe indépendant... On offre les options différentes de l'état actuel
				for(var e=1; e<=3; e++){
					if(etat!=e){
						var ebutton = this.sb.createElement("label");
						var elabel =  (e==1)?(nc_locale.GetStringFromName("Tags.yes")):((e==2)?(nc_locale.GetStringFromName("Tags.no")):((e==3)?(nc_locale.GetStringFromName("Tags.joker")):(nc_locale.GetStringFromName("Tags.untagged"))));
						ebutton.setAttribute("value", " > "+elabel+" ");
						ebutton.setAttribute("style", "cursor:pointer;background-color:#666;color:#FFF;border:3px solid "+etat_color+";font-size:8px;font-weight:bold;");
						ebutton.setAttribute("onclick", "window.top.nc_tagMan.setSiteState(\""+lmd5+"\", \""+nc_mem.getCurrentDomain()+"\", "+e+");");
						buttonBox.appendChild(ebutton);
					}
				}
			} else {
				// Si dans un groupe :
				// Non-classé : oui, non, report
				// Oui : option -> report
				// Non : option -> oui
				// report : option -> oui
				for(var e=1; e<=3; e++){
					if((etat==0 && e!=2) || (etat==1 && e==3) || (etat!=0 && etat!=1 && e==1)){
						var ebutton = this.sb.createElement("label");
						var elabel =  (e==1)?(nc_locale.GetStringFromName("Tags.yes")):((e==2)?(nc_locale.GetStringFromName("Tags.no")):((e==3)?(nc_locale.GetStringFromName("Tags.joker")):(nc_locale.GetStringFromName("Tags.untagged"))));
						ebutton.setAttribute("value", " > "+elabel+" ");
						ebutton.setAttribute("style", "cursor:pointer;background-color:#666;color:#FFF;border:3px solid "+etat_color+";font-size:8px;font-weight:bold;");
						ebutton.setAttribute("onclick", "window.top.nc_tagMan.setSiteState(\""+lmd5+"\", \""+nc_mem.getCurrentDomain()+"\", "+e+");");
						buttonBox.appendChild(ebutton);
					}
				}
			}
			var postboutons = this.sb.createElement("label");
			postboutons.setAttribute("value", "   ");
			postboutons.setAttribute("style", "background-color:"+etat_color+";border:3px solid "+etat_color+";font-size:8px;");
			buttonBox.appendChild(postboutons);
			// Groupes
			if(nc_tagMan.getGroupes().length>1){
				var groupsBox = this.sb.createElement("hbox");
				groupsBox.setAttribute("style", "background-color:#CCC;font-size:9px;border-top:1px solid #666;margin-left:5px;margin-right:5px;");
				groupsBox.setAttribute("flex", "1");
				var groupsTitre = this.sb.createElement("label");
				groupsTitre.setAttribute("value", " "+nc_locale.GetStringFromName("group2")+" :  ");
				groupsBox.appendChild(groupsTitre);
				for(var g=0; g<nc_tagMan.getGroupes().length; g++){
					if(groupe==g){
						// groupe sélectionné
						var groupeLabel = this.sb.createElement("label");
						groupeLabel.setAttribute("value", " ["+groupe+" : \""+nc_tagMan.getGroupes()[g]+"\"] ");
						groupeLabel.setAttribute("style", "background-color:#CCC;color:#000;border:2px solid #CCC;font-size:8px;font-weight:bold;");
						groupsBox.appendChild(groupeLabel);
					} else {
						// Autres groupes
						var groupeLabel = this.sb.createElement("label");
						groupeLabel.setAttribute("value", " ["+g+"] ");
						groupeLabel.setAttribute("style", "cursor:pointer;background-color:#CCC;color:#666;border:2px solid #CCC;font-size:8px;");
						groupeLabel.setAttribute("onclick", "window.top.nc_tagMan.setLibelleGroupe(\""+lmd5+"\", \""+g+"\");");
						groupsBox.appendChild(groupeLabel);
					}
				}
				var groupsDroite = this.sb.createElement("label");
				groupsDroite.setAttribute("value", " ");
				groupsDroite.setAttribute("flex", "1");
				groupsBox.appendChild(groupsDroite);
				tagBox.appendChild(groupsBox);
			}
		}
	}
	this.updateHeurInfo = function(){
		// vocabulaire
		var voc_entities = nc_locale.GetStringFromName("ui.scrap.entities");
		var voc_types = nc_locale.GetStringFromName("ui.scrap.types");
		var voc_current = nc_locale.GetStringFromName("ui.scrap.current");
		var voc_currentEntities = nc_locale.GetStringFromName("ui.scrap.currentEntities");
		var voc_sites = nc_locale.GetStringFromName("ui.scrap.sites");
		var voc_currentSiteProperties = nc_locale.GetStringFromName("ui.scrap.currentSiteProperties");
		var voc_entityProperties = nc_locale.GetStringFromName("ui.scrap.entityProperties");
		var voc_siteProperties = nc_locale.GetStringFromName("ui.scrap.siteProperties");
		var voc_linkTypes = nc_locale.GetStringFromName("ui.scrap.linkTypes");
		// Active Filters
		var filtersBox = this.sb.getElementById("nc_heur_active_filters");
		this.domClear(filtersBox);
		var filtersList = nc_heuristiques.getFiltersList();
		var activities = nc_heuristiques.whichFiltersActive(filtersList);
		for(var f=0; f<filtersList.length; f++){
			//alert(filtersList[f]+"\n"+activities[f]);
			var fCheckbox = this.sb.createElement("checkbox");
			fCheckbox.setAttribute("label", filtersList[f]);
			if (activities[f]) {
				fCheckbox.setAttribute("checked", "true");
				fCheckbox.setAttribute("onclick", "window.top.nc_heuristiques.setFilterInactive(\""+filtersList[f]+"\");");
			} else {
				fCheckbox.setAttribute("checked", "false");
				fCheckbox.setAttribute("onclick", "window.top.nc_heuristiques.setFilterActive(\""+filtersList[f]+"\");");
			}
			filtersBox.appendChild(fCheckbox);
		}
		// Data
		var treeChildren = this.sb.getElementById("nc_heuristiques_treeChildren");
		this.domClear(treeChildren);
		var currentTreechildren = this.private_addTreeItem(voc_current, treeChildren, true, true);
		var currentEntitiesTreechildren = this.private_addTreeItem(voc_currentEntities+" ("+nc_heuristiques.data.currentEntities.length+")", currentTreechildren, true, false);
		for each (e in nc_heuristiques.data.currentEntities){
			var entity = e.name;
			var entityTreechildren = this.private_addTreeItem(entity+" ("+e.properties.length+")", currentEntitiesTreechildren, true, false);
			for each (p in e.properties){
				this.private_addTreeItem(p.name+" = "+p.value, entityTreechildren, false, false);
			}
		}
		var currentSitePropertiesTreechildren = this.private_addTreeItem(voc_currentSiteProperties+" ("+nc_heuristiques.data.currentSiteProperties.length+")", currentTreechildren, true, false);
		for each (sp in nc_heuristiques.data.currentSiteProperties){
			var sitePropertyTreechildren = this.private_addTreeItem(sp.name+" = "+sp.value, currentSitePropertiesTreechildren, true, false);
			this.private_addTreeItem("site : "+sp.site, sitePropertyTreechildren, false, false);
		}
		var entitiesTreechildren = this.private_addTreeItem(voc_entities+" ("+nc_heuristiques.data.entTypes.length+" "+voc_types+")", treeChildren, true, true);
		for(var typeIndex=0; typeIndex<nc_heuristiques.data.entTypes.length; typeIndex++){
			var type = nc_heuristiques.data.entTypes[typeIndex];
			var typeTreechildren = this.private_addTreeItem(type+" ("+nc_heuristiques.data.entTypesEntities[typeIndex].length+")", entitiesTreechildren, true, false);
			for each (e in nc_heuristiques.data.entTypesEntities[typeIndex]){
				var entity = e.name;
				var entityTreechildren = this.private_addTreeItem(entity+" ("+e.properties.length+")", typeTreechildren, true, false);
				for each (p in e.properties){
					this.private_addTreeItem(p.name+" = "+p.value, entityTreechildren, false, false);
				}
				var sitelinkTreechildren = this.private_addTreeItem("Links to Sites ("+e.linksTo.site.length+")", entityTreechildren, true, false);
				for each (sl in e.linksTo.site){
					this.private_addTreeItem(sl.relation+" : "+sl.dmn, sitelinkTreechildren, false, false);
				}
				var entitylinkTreechildren = this.private_addTreeItem("Links to Entities ("+e.linksTo.entity.length+")", entityTreechildren, true, false);
				for each (el in e.linksTo.entity){
					this.private_addTreeItem(el.relation+" : "+el.entity, entitylinkTreechildren, false, false);
				}
			}
		}
		var sitesTreechildren = this.private_addTreeItem(voc_sites+" ("+nc_heuristiques.data.sites.length+")", treeChildren, true, true);
		for each (s in nc_heuristiques.data.sites){
			var siteTreechildren = this.private_addTreeItem(s.domain+" ("+s.properties.length+")", sitesTreechildren, true, false);
			for each (p in s.properties){
				this.private_addTreeItem(p.name+" = "+p.value, siteTreechildren, false, false);
			}
			var sitelinkTreechildren = this.private_addTreeItem("Links to Sites ("+s.linksTo.site.length+")", siteTreechildren, true, false);
			for each (sl in s.linksTo.site){
				this.private_addTreeItem(sl.relation+" : "+sl.dmn, sitelinkTreechildren, false, false);
			}
			var entitylinkTreechildren = this.private_addTreeItem("Links to Entities ("+s.linksTo.entity.length+")", siteTreechildren, true, false);
			for each (el in s.linksTo.entity){
				this.private_addTreeItem(el.relation+" : "+el.entity, entitylinkTreechildren, false, false);
			}
		}
		var entityPropertiesTreechildren = this.private_addTreeItem(voc_entityProperties+" ("+nc_heuristiques.data.entProperties.length+")", treeChildren, true, false);
		for each (p in nc_heuristiques.data.entProperties){
			this.private_addTreeItem(p, entityPropertiesTreechildren, false, false);
		}
		var sitePropertiesTreechildren = this.private_addTreeItem(voc_siteProperties+" ("+nc_heuristiques.data.siteProperties.length+")", treeChildren, true, false);
		for each (p in nc_heuristiques.data.siteProperties){
			this.private_addTreeItem(p, sitePropertiesTreechildren, false, false);
		}
		var linkTypesTreechildren = this.private_addTreeItem(voc_linkTypes+" ("+nc_heuristiques.data.linkTypes.length+")", treeChildren, true, false);
		for each (lt in nc_heuristiques.data.linkTypes){
			this.private_addTreeItem(lt, linkTypesTreechildren, false, false);
		}
	}
	//
	this.private_addTreeItem = function(label, parent, container, open){
		var item = this.sb.createElement("treeitem");
		if(container)
			item.setAttribute("container", "true");
		if(open)
			item.setAttribute("open", "true");
		parent.appendChild(item);
		var row = this.sb.createElement("treerow");
		var cell = this.sb.createElement("treecell");
		cell.setAttribute("label",label);
		row.appendChild(cell);
		item.appendChild(row);
		if (container) {
			var treechildren = this.sb.createElement("treechildren");
			item.appendChild(treechildren);
			return treechildren;
		} else {
			return null;
		}
	}
	// Au chargement de Firefox, la sidebar n'existe pas encore (erreur sur this.sb).
	// Il faut donc initialiser au premier chargement, d'où cette fonction.
	this.private_initializeSb = function(){
		this.sb = window.document.getElementById("sidebar-box").childNodes[1].webNavigation.document;
		// Afficher l'inteface
		this.sb.getElementById("nc_waiting").setAttribute("hidden", "true");
		this.sb.getElementById("nc_tabbox").setAttribute("hidden", "false");
		// Enregistrer les fonctions des boutons de l'interface
		this.sb.getElementById("nc_flag_page_button").setAttribute("oncommand", "window.top.nc_mem.switch_flagCurrentPage();");
		this.sb.getElementById("nc_switch_site_state_button").setAttribute("oncommand", "window.top.nc_mem.switch_stateCurrentSite();");
		this.sb.getElementById("nc_navList_sort").setAttribute("oncommand", "window.top.nc_ui.sortNavTable();");
		this.sb.getElementById("nc_navList_find").setAttribute("oncommand", "window.top.nc_ui.findNavTable();");
		this.sb.getElementById("nc_ajout_libelle_button").setAttribute("oncommand", "window.top.nc_tagMan.ajouter();");
		this.sb.getElementById("nc_ajout_groupe_button").setAttribute("oncommand", "window.top.nc_tagMan.grouper();");
		this.sb.getElementById("nc_reset_button").setAttribute("oncommand", "window.top.nc_resetAll();");
		this.sb.getElementById("nc_openlist_button").setAttribute("oncommand", "window.top.nc_io.openUrlsList();");
		this.sb.getElementById("nc_import_button").setAttribute("oncommand", "window.top.nc_io.importer();");
		this.sb.getElementById("nc_export_GDF_button").setAttribute("oncommand", "window.top.nc_io.exporterGDF();");
		this.sb.getElementById("nc_export_NET_button").setAttribute("oncommand", "window.top.nc_io.exporterNET();");
		this.sb.getElementById("nc_export_WXSF_button").setAttribute("oncommand", "window.top.nc_io.exporterWXSF();");
		this.sb.getElementById("nc_export_CSV_button").setAttribute("oncommand", "window.top.nc_io.exporterCSV();");
		this.sb.getElementById("nc_export_FlaggedPages_button").setAttribute("oncommand", "window.top.nc_io.exporterFlaggedPagesCSV();");
		this.sb.getElementById("nc_export_pages_graph_button").setAttribute("oncommand", "window.top.nc_io.exporterPagesGraph();");
		this.sb.getElementById("nc_test_button").setAttribute("oncommand", "window.top.shlog();");
		this.sb.getElementById("nc_heur_import").setAttribute("oncommand", "window.top.nc_io.importHeuristicsXML();");
		this.sb.getElementById("nc_heur_export").setAttribute("oncommand", "window.top.nc_io.exportHeuristicsXML();");
		this.sb.getElementById("nc_live_on").setAttribute("oncommand", "window.top.nc_gconnect.switchActivation();");
		this.sb.getElementById("nc_live_onlySites").setAttribute("oncommand", "window.top.nc_gconnect.switchOnlySites();");
		this.sb.getElementById("nc_util_delete_voisins_feuilles_button").setAttribute("oncommand", "window.top.nc_utils.removeVoisinsFeuilles();");
		this.sb.getElementById("nc_util_open_visites_button").setAttribute("oncommand", "window.top.nc_utils.openEachVisite();");
		this.sb.getElementById("nc_crawlScrapped").setAttribute("oncommand", "window.top.nc_ui.update();");
		this.sb.getElementById("nc_reparse").setAttribute("oncommand", "window.top.nc_ddp.processCurrentPage();");
		this.private_makeNavUI();
		// Onglets du Navicrawler affichés
		this.sb.getElementById("nc_plus_classTab").setAttribute("oncommand", "window.top.nc_ui.configTabs();");
		this.sb.getElementById("nc_plus_crawlTab").setAttribute("oncommand", "window.top.nc_ui.configTabs();");
		this.sb.getElementById("nc_plus_heurTab").setAttribute("oncommand", "window.top.nc_ui.configTabs();");
		this.sb.getElementById("nc_plus_utilsTab").setAttribute("oncommand", "window.top.nc_ui.configTabs();");
		this.sb.getElementById("nc_plus_liveTab").setAttribute("oncommand", "window.top.nc_ui.configTabs();");
		// Ecouteur de changement de tab
		this.sb.getElementById("nc_tabbox_tabs").addEventListener("select", nc_ui.onChangeSidebarTab, true);
		// Update toutes les tabs
		this.updateNavInfo();
		this.updateCrawlInfo();
		this.updateTagInfo();
		this.updateHeurInfo();
		this.sbInitialized = true;
	}
	// Les onglets sont affichés selon les cases cochées à la fin dans l'onglet (+).
	this.configTabs = function(){
		this.sb.getElementById("nc_nav_tab").hidden = true;
		this.sb.getElementById("nc_class_tab").hidden = true;
		this.sb.getElementById("nc_bot_tab").hidden = true;
		this.sb.getElementById("nc_heurisitques_tab").hidden = true;
		this.sb.getElementById("nc_io_tab").hidden = true;
		this.sb.getElementById("nc_util_tab").hidden = true;
		this.sb.getElementById("nc_plus_tab").hidden = true;

		this.sb.getElementById("nc_plus_tab").hidden = false;
		this.sb.getElementById("nc_live_tab").hidden = !this.sb.getElementById("nc_plus_liveTab").checked;
		this.sb.getElementById("nc_util_tab").hidden = !this.sb.getElementById("nc_plus_utilsTab").checked;
		this.sb.getElementById("nc_io_tab").hidden = false;
		this.sb.getElementById("nc_heurisitques_tab").hidden = !this.sb.getElementById("nc_plus_heurTab").checked;
		this.sb.getElementById("nc_bot_tab").hidden = !this.sb.getElementById("nc_plus_crawlTab").checked;
		this.sb.getElementById("nc_class_tab").hidden = !this.sb.getElementById("nc_plus_classTab").checked;
		this.sb.getElementById("nc_nav_tab").hidden = false;
		
	}
	this.onChangeSidebarTab = function(aEvent){
		if(nc_switch.NC_is_On()){
			//alert(aEvent.originalTarget.localName);
			nc_ui.update();
		}
	}
	// Cette fonction sert à implémenter dans l'interface la gestion de l'interaction entre la souris et les
	// différentes boîtes contenant des infos dans l'onglet général de la sidebar :
	// le survol de la souris et la fonction activée.
	this.private_makeNavUI = function(){
		var mouseOverStyle = "border: 1px solid #FF0; margin-right: 2px; background-color:#FF0;";
		// Interface : Page déjà visitée
		var deja_visitee_style = this.sb.getElementById("nc_deja_visitee_box").getAttribute("style");
		this.sb.getElementById("nc_deja_visitee_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_deja_visitee_box\").setAttribute(\"style\", \""+mouseOverStyle+"\");");
		this.sb.getElementById("nc_deja_visitee_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_deja_visitee_box\").setAttribute(\"style\", \""+deja_visitee_style+"\");");
		this.sb.getElementById("nc_deja_visitee_box").setAttribute("onclick", "window.top.nc_ui.showTable_deja_visitee();");
		// Interface : Page liens_sortants
		var liens_sortants_style = this.sb.getElementById("nc_liens_sortants_box").getAttribute("style");
		this.sb.getElementById("nc_liens_sortants_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_liens_sortants_box\").setAttribute(\"style\", \""+mouseOverStyle+"\");");
		this.sb.getElementById("nc_liens_sortants_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_liens_sortants_box\").setAttribute(\"style\", \""+liens_sortants_style+"\");");
		this.sb.getElementById("nc_liens_sortants_box").setAttribute("onclick", "window.top.nc_ui.showTable_liens_sortants();");
		// Interface : Site pages_visitees
		var pages_visitees_style = this.sb.getElementById("nc_pages_visitees_box").getAttribute("style");
		this.sb.getElementById("nc_pages_visitees_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_pages_visitees_box\").setAttribute(\"style\", \""+mouseOverStyle+"\");");
		this.sb.getElementById("nc_pages_visitees_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_pages_visitees_box\").setAttribute(\"style\", \""+pages_visitees_style+"\");");
		this.sb.getElementById("nc_pages_visitees_box").setAttribute("onclick", "window.top.nc_ui.showTable_pages_visitees();");
		// Interface : Site pages_reperees
		var pages_reperees_style = this.sb.getElementById("nc_pages_reperees_box").getAttribute("style");
		this.sb.getElementById("nc_pages_reperees_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_pages_reperees_box\").setAttribute(\"style\", \""+mouseOverStyle+"\");");
		this.sb.getElementById("nc_pages_reperees_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_pages_reperees_box\").setAttribute(\"style\", \""+pages_reperees_style+"\");");
		this.sb.getElementById("nc_pages_reperees_box").setAttribute("onclick", "window.top.nc_ui.showTable_pages_reperees();");
		// Interface : Site sites_refereurs
		var sites_refereurs_style = this.sb.getElementById("nc_sites_refereurs_box").getAttribute("style");
		this.sb.getElementById("nc_sites_refereurs_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_sites_refereurs_box\").setAttribute(\"style\", \""+mouseOverStyle+"\");");
		this.sb.getElementById("nc_sites_refereurs_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_sites_refereurs_box\").setAttribute(\"style\", \""+sites_refereurs_style+"\");");
		this.sb.getElementById("nc_sites_refereurs_box").setAttribute("onclick", "window.top.nc_ui.showTable_sites_refereurs();");
		// Interface : Site sites_cites
		var sites_cites_style = this.sb.getElementById("nc_sites_cites_box").getAttribute("style");
		this.sb.getElementById("nc_sites_cites_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_sites_cites_box\").setAttribute(\"style\", \""+mouseOverStyle+"\");");
		this.sb.getElementById("nc_sites_cites_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_sites_cites_box\").setAttribute(\"style\", \""+sites_cites_style+"\");");
		this.sb.getElementById("nc_sites_cites_box").setAttribute("onclick", "window.top.nc_ui.showTable_sites_cites();");
		// Interface : Session sites_visited
		var sites_visited_style = this.sb.getElementById("nc_sites_visited_box").getAttribute("style");
		this.sb.getElementById("nc_sites_visited_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_sites_visited_box\").setAttribute(\"style\", \""+mouseOverStyle+"\");");
		this.sb.getElementById("nc_sites_visited_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_sites_visited_box\").setAttribute(\"style\", \""+sites_visited_style+"\");");
		this.sb.getElementById("nc_sites_visited_box").setAttribute("onclick", "window.top.nc_ui.showTable_sites_visited();");
		// Interface : Session sites_voisin
		var sites_voisin_style = this.sb.getElementById("nc_sites_voisin_box").getAttribute("style");
		this.sb.getElementById("nc_sites_voisin_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_sites_voisin_box\").setAttribute(\"style\", \""+mouseOverStyle+"\");");
		this.sb.getElementById("nc_sites_voisin_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_sites_voisin_box\").setAttribute(\"style\", \""+sites_voisin_style+"\");");
		this.sb.getElementById("nc_sites_voisin_box").setAttribute("onclick", "window.top.nc_ui.showTable_sites_voisin();");
		// Interface : Session sites_frontier
		var sites_frontier_style = this.sb.getElementById("nc_sites_frontier_box").getAttribute("style");
		this.sb.getElementById("nc_sites_frontier_box").setAttribute("onmouseover", "window.document.getElementById(\"nc_sites_frontier_box\").setAttribute(\"style\", \""+mouseOverStyle+"\");");
		this.sb.getElementById("nc_sites_frontier_box").setAttribute("onmouseout", "window.document.getElementById(\"nc_sites_frontier_box\").setAttribute(\"style\", \""+sites_frontier_style+"\");");
		this.sb.getElementById("nc_sites_frontier_box").setAttribute("onclick", "window.top.nc_ui.showTable_sites_frontier();");
	}
	// NB : Les fonctions en "showTable" servent à afficher dans l'onglet général les
	//      tableaux correspondant aux diverses données affichables.
	this.showTable_deja_visitee = function(){
		this.tableauChoisi = "deja_visitee";
		///// Faire le titre
		this.sb.getElementById("nc_navList_label").setAttribute("value", nc_locale.GetStringFromName("legend.visitedPagesInSite"));
		///// Faire la légende
		var legend = this.sb.getElementById("nc_navList_legend");
		// Effacer la légende
		while(legend.childNodes.length){
			legend.removeChild(legend.firstChild);
		}
		///// Faire le tableau
		var listbox = this.sb.getElementById("nc_navList");
		// Effacer le contenu
		while(listbox.childNodes.length){
			listbox.removeChild(listbox.firstChild);
		}
		// Reremplir le tableau
		var pages = nc_siteMan.getPages(nc_mem.getCurrentDomain());
		for(var i=0; i<pages.length; i++){
			var ligne = this.sb.createElement("listitem");
			ligne.setAttribute("label", pages[i]);
			ligne.setAttribute("style", "font-size:10px;");
			ligne.onclick = function(event) {nc_ui.openURL_fromList(event, event.originalTarget.getAttribute("label"));};
			listbox.appendChild(ligne);
		}
	}
	this.showTable_liens_sortants = function(){
		this.tableauChoisi = "liens_sortants";
		///// Faire le titre
		this.sb.getElementById("nc_navList_label").setAttribute("value", nc_locale.GetStringFromName("legend.linksInPage"));
		///// Faire la légende
		var legend = this.sb.getElementById("nc_navList_legend");
		// Effacer la légende
		while(legend.childNodes.length){
			legend.removeChild(legend.firstChild);
		}
		// Faire la légende
		var item0 = this.sb.createElement("label");
		item0.setAttribute("style", "font-weight:bold;");
		item0.setAttribute("value", nc_locale.GetStringFromName("legend.legend"));
		legend.appendChild(item0);
		var item1 = this.sb.createElement("label");
		item1.setAttribute("style", "color:#006;");
		item1.setAttribute("value", nc_locale.GetStringFromName("legend.internalLinks"));
		legend.appendChild(item1);
		var item2 = this.sb.createElement("label");
		item2.setAttribute("style", "color:#660;");
		item2.setAttribute("value", nc_locale.GetStringFromName("legend.externalLinks"));
		legend.appendChild(item2);
		///// Faire le tableau
		var listbox = this.sb.getElementById("nc_navList");
		// Effacer le contenu
		while(listbox.childNodes.length){
			listbox.removeChild(listbox.firstChild);
		}
		// Reremplir le tableau
		var links = nc_mem.getCurrentLinks();
		for(var i=0; i<links.length; i++){
			var ligne = this.sb.createElement("listitem");
			ligne.setAttribute("label", links[i]);
			if(nc_parser.getHostFromUrl(links[i])==nc_parser.getHostFromUrl(nc_mem.getCurrentUrl())){
				ligne.setAttribute("style", "font-size:10px; color:#006;");			
			} else {
				ligne.setAttribute("style", "font-size:10px; color:#660;");							
			}
			ligne.onclick = function(event) {nc_ui.openURL_fromList(event, event.originalTarget.getAttribute("label"));};
			listbox.appendChild(ligne);
		}
	}
	this.showTable_pages_visitees = function(){
		this.tableauChoisi = "pages_visitees";
		///// Faire le titre
		this.sb.getElementById("nc_navList_label").setAttribute("value", nc_locale.GetStringFromName("legend.visitedPages"));
		///// Faire la légende
		var legend = this.sb.getElementById("nc_navList_legend");
		// Effacer la légende
		while(legend.childNodes.length){
			legend.removeChild(legend.firstChild);
		}
		///// Faire le tableau
		var listbox = this.sb.getElementById("nc_navList");
		// Effacer le contenu
		while(listbox.childNodes.length){
			listbox.removeChild(listbox.firstChild);
		}
		// Reremplir le tableau
		var pages = nc_siteMan.getPages(nc_mem.getCurrentDomain());
		for(var i=0; i<pages.length; i++){
			var ligne = this.sb.createElement("listitem");
			ligne.setAttribute("label", pages[i]);
			ligne.setAttribute("style", "font-size:10px;");
			ligne.onclick = function(event) {nc_ui.openURL_fromList(event, event.originalTarget.getAttribute("label"));};
			listbox.appendChild(ligne);
		}
	}
	this.showTable_pages_reperees = function(){
		this.tableauChoisi = "pages_reperees";
		///// Faire le titre
		this.sb.getElementById("nc_navList_label").setAttribute("value", nc_locale.GetStringFromName("legend.flaggedPages"));
		///// Faire la légende
		var legend = this.sb.getElementById("nc_navList_legend");
		// Effacer la légende
		while(legend.childNodes.length){
			legend.removeChild(legend.firstChild);
		}
		///// Faire le tableau
		var listbox = this.sb.getElementById("nc_navList");
		// Effacer le contenu
		while(listbox.childNodes.length){
			listbox.removeChild(listbox.firstChild);
		}
		// Reremplir le tableau
		var pages = nc_siteMan.getPages_flag(nc_mem.getCurrentDomain());
		for(var i=0; i<pages.length; i++){
			var ligne = this.sb.createElement("listitem");
			ligne.setAttribute("label", pages[i]);
			ligne.setAttribute("style", "font-size:10px;");
			ligne.onclick = function(event) {nc_ui.openURL_fromList(event, event.originalTarget.getAttribute("label"));};
			listbox.appendChild(ligne);
		}
	}
	this.showTable_sites_refereurs = function(){
		this.tableauChoisi = "sites_refereurs";
		///// Faire le titre
		this.sb.getElementById("nc_navList_label").setAttribute("value", nc_locale.GetStringFromName("legend.referers"));
		///// Faire la légende
		var legend = this.sb.getElementById("nc_navList_legend");
		// Effacer la légende
		while(legend.childNodes.length){
			legend.removeChild(legend.firstChild);
		}
		// Faire la légende
		var item0 = this.sb.createElement("label");
		item0.setAttribute("style", "font-weight:bold;");
		item0.setAttribute("value", "Légende :  ");
		legend.appendChild(item0);
		var item1 = this.sb.createElement("label");
		item1.setAttribute("style", "color:#0A0;");
		item1.setAttribute("value", "Sites visités, ");
		legend.appendChild(item1);
		var item2 = this.sb.createElement("label");
		item2.setAttribute("style", "color:#A60;");
		item2.setAttribute("value", "Sites voisins, ");
		legend.appendChild(item2);
		var item3 = this.sb.createElement("label");
		item3.setAttribute("style", "color:#600;");
		item3.setAttribute("value", "Sites frontière ");
		legend.appendChild(item3);
		///// Faire le tableau
		var listbox = this.sb.getElementById("nc_navList");
		// Effacer le contenu
		while(listbox.childNodes.length){
			listbox.removeChild(listbox.firstChild);
		}
		// Reremplir le tableau
		var sites = nc_siteMan.getLinksFrom(nc_mem.getCurrentDomain());
		for(var i=0; i<sites.length; i++){
			var ligne = this.sb.createElement("listitem");
			ligne.setAttribute("label", sites[i]);
			if(nc_siteMan.isVisited(sites[i])){
				ligne.setAttribute("style", "font-size:10px; color:#0A0;");
			} else if(nc_siteMan.isVoisin(sites[i])){
				ligne.setAttribute("style", "font-size:10px; color:#A60;");
			} else if(nc_siteMan.isFrontier(sites[i])){
				ligne.setAttribute("style", "font-size:10px; color:#600;");
			} else {
				ligne.setAttribute("style", "font-size:10px; color:#666;");
			}
			ligne.onclick = function(event) {nc_ui.openURL_fromList(event, event.originalTarget.getAttribute("label"));};
			listbox.appendChild(ligne);
		}
	}
	this.showTable_sites_cites = function(){
		this.tableauChoisi = "sites_cites";
		///// Faire le titre
		this.sb.getElementById("nc_navList_label").setAttribute("value", nc_locale.GetStringFromName("legend.cited"));
		///// Faire la légende
		var legend = this.sb.getElementById("nc_navList_legend");
		// Effacer la légende
		while(legend.childNodes.length){
			legend.removeChild(legend.firstChild);
		}
		// Faire la légende
		var item0 = this.sb.createElement("label");
		item0.setAttribute("style", "font-weight:bold;");
		item0.setAttribute("value", "Légende :  ");
		legend.appendChild(item0);
		var item1 = this.sb.createElement("label");
		item1.setAttribute("style", "color:#0A0;");
		item1.setAttribute("value", "Sites visités, ");
		legend.appendChild(item1);
		var item2 = this.sb.createElement("label");
		item2.setAttribute("style", "color:#A60;");
		item2.setAttribute("value", "Sites voisins, ");
		legend.appendChild(item2);
		var item3 = this.sb.createElement("label");
		item3.setAttribute("style", "color:#600;");
		item3.setAttribute("value", "Sites frontière");
		legend.appendChild(item3);
		///// Faire le tableau
		var listbox = this.sb.getElementById("nc_navList");
		// Effacer le contenu
		while(listbox.childNodes.length){
			listbox.removeChild(listbox.firstChild);
		}
		// Reremplir le tableau
		var sites = nc_siteMan.getLinksTo(nc_mem.getCurrentDomain());
		for(var i=0; i<sites.length; i++){
			var ligne = this.sb.createElement("listitem");
			ligne.setAttribute("label", sites[i]);
			if(nc_siteMan.isVisited(sites[i])){
				ligne.setAttribute("style", "font-size:10px; color:#0A0;");
			} else if(nc_siteMan.isVoisin(sites[i])){
				ligne.setAttribute("style", "font-size:10px; color:#A60;");
			} else if(nc_siteMan.isFrontier(sites[i])){
				ligne.setAttribute("style", "font-size:10px; color:#600;");
			} else {
				ligne.setAttribute("style", "font-size:10px; color:#666;");
			}
			ligne.onclick = function(event) {nc_ui.openURL_fromList(event, event.originalTarget.getAttribute("label"));};
			listbox.appendChild(ligne);
		}
	}
	this.showTable_sites_visited = function(){
		this.tableauChoisi = "sites_visited";
		///// Faire le titre
		this.sb.getElementById("nc_navList_label").setAttribute("value", nc_locale.GetStringFromName("legend.in"));
		///// Faire la légende
		var legend = this.sb.getElementById("nc_navList_legend");
		// Effacer la légende
		while(legend.childNodes.length){
			legend.removeChild(legend.firstChild);
		}
		///// Faire le tableau
		var listbox = this.sb.getElementById("nc_navList");
		// Effacer le contenu
		while(listbox.childNodes.length){
			listbox.removeChild(listbox.firstChild);
		}
		// Reremplir le tableau
		var sites = nc_siteMan.getSites();
		for(var i=0; i<sites.length; i++){
			var ligne = this.sb.createElement("listitem");
			if(nc_siteMan.isVisited(sites[i])){
				ligne.setAttribute("label", sites[i]);
				ligne.setAttribute("style", "font-size:10px; color:#0A0;");
				ligne.onclick = function(event) {nc_ui.openURL_fromList(event, event.originalTarget.getAttribute("label"));};
				listbox.appendChild(ligne);
			}
		}
	}
	this.showTable_sites_voisin = function(){
		this.tableauChoisi = "sites_voisin";
		///// Faire le titre
		this.sb.getElementById("nc_navList_label").setAttribute("value", nc_locale.GetStringFromName("legend.next"));
		///// Faire la légende
		var legend = this.sb.getElementById("nc_navList_legend");
		// Effacer la légende
		while(legend.childNodes.length){
			legend.removeChild(legend.firstChild);
		}
		///// Faire le tableau
		var listbox = this.sb.getElementById("nc_navList");
		// Effacer le contenu
		while(listbox.childNodes.length){
			listbox.removeChild(listbox.firstChild);
		}
		// Reremplir le tableau
		var sites = nc_siteMan.getSites();
		for(var i=0; i<sites.length; i++){
			var ligne = this.sb.createElement("listitem");
			if(nc_siteMan.isVoisin(sites[i])){
				ligne.setAttribute("label", sites[i]);
				ligne.setAttribute("style", "font-size:10px; color:#A60;");
				ligne.onclick = function(event) {nc_ui.openURL_fromList(event, event.originalTarget.getAttribute("label"));};
				listbox.appendChild(ligne);
			}
		}
	}
	this.showTable_sites_frontier = function(){
		this.tableauChoisi = "sites_frontier";
		///// Faire le titre
		this.sb.getElementById("nc_navList_label").setAttribute("value", nc_locale.GetStringFromName("legend.out"));
		///// Faire la légende
		var legend = this.sb.getElementById("nc_navList_legend");
		// Effacer la légende
		while(legend.childNodes.length){
			legend.removeChild(legend.firstChild);
		}
		///// Faire le tableau
		var listbox = this.sb.getElementById("nc_navList");
		// Effacer le contenu
		while(listbox.childNodes.length){
			listbox.removeChild(listbox.firstChild);
		}
		// Reremplir le tableau
		var sites = nc_siteMan.getSites();
		for(var i=0; i<sites.length; i++){
			var ligne = this.sb.createElement("listitem");
			if(nc_siteMan.isFrontier(sites[i])){
				ligne.setAttribute("label", sites[i]);
				ligne.setAttribute("style", "font-size:10px; color:#600;");
				ligne.onclick = function(event) {nc_ui.openURL_fromList(event, event.originalTarget.getAttribute("label"));};
				listbox.appendChild(ligne);
			}
		}
	}
	this.selectHH = function(obj){
		// HH : heuristique historique
		this.currentHH = obj;
		this.update();
	}
	this.openURL_fromList = function(e, url){
		if(e.shiftKey){
			if(nc_siteMan.isVisited(url) || nc_siteMan.isVoisin(url)){
				nc_siteMan.setFrontier(url);
				nc_ui.update();
			}
		} else if(e.ctrlKey) {
			nc_parasit.goToURL(url, "tab");
		} else {
			nc_parasit.goToURL(url, "normal");
		}
	}
	this.domClear = function(anElement){
		while(anElement.childNodes.length>0){
			this.domClear(anElement.firstChild);
			anElement.removeChild(anElement.firstChild);
		}
	}
	this.getTagToAdd = function(){
		var result = this.sb.getElementById("nc_ajout_libelle_textbox").value;
		this.sb.getElementById("nc_ajout_libelle_textbox").value = "";
		return result;
	}
	this.getGroupToAdd = function(){
		var result = this.sb.getElementById("nc_ajout_groupe_textbox").value;
		this.sb.getElementById("nc_ajout_groupe_textbox").value = "";
		return result;
	}
	this.getExportVisite = function(){
		return (this.sb.getElementById("nc_export_option_visite").getAttribute("checked")=="true");
	}
	this.getExportVoisin = function(){
		return (this.sb.getElementById("nc_export_option_voisin").getAttribute("checked")=="true");
	}
	this.getExportFrontiere = function(){
		return (this.sb.getElementById("nc_export_option_frontiere").getAttribute("checked")=="true");
	}
	this.getExportScrapped = function(){
		return (this.sb.getElementById("nc_export_option_scrap").getAttribute("checked")=="true");
	}
	this.activateProgress = function(totalSteps){
		this.progressSteps = totalSteps;
		this.progressSteps_done = 0;
		this.sb.getElementById("nc_progress").hidden = false;
		this.sb.getElementById("nc_progress").value = "0%";
		this.sb.getElementById("nc_progress_text").hidden = false;
		this.sb.getElementById("nc_progress_text").value = "Veuillez patienter";
	}
	this.setStepProgress = function(steps, totalSteps, texte){
		this.progressSteps = totalSteps;
		this.progressSteps_done = steps;
		var percent = parseInt(100*this.progressSteps_done/this.progressSteps, 10);
		this.sb.getElementById("nc_progress").value = percent;
		this.sb.getElementById("nc_progress_text").value = texte;
	}
	this.stepProgress = function(texte){
		this.progressSteps_done++;
		var percent = parseInt(100*this.progressSteps_done/this.progressSteps, 10);
		this.sb.getElementById("nc_progress").value = percent;
		this.sb.getElementById("nc_progress_text").value = texte;
		setTimeout(nc_ui.private_progressFunction, 4);
		
	}
	this.disableProgress = function(){
		this.sb.getElementById("nc_progress").hidden = true;
		this.sb.getElementById("nc_progress_text").hidden = true;
		nc_ui.private_progressFunction = function(){};
	}
	this.addProgressListener = function(ecouteur){
		nc_ui.private_progressFunction = ecouteur;
	}
	this.removeProgressListener = function(){
		nc_ui.private_progressFunction = function(){};
	}
	this.private_progressFunction = function(){}
}

/**
 * Agent Import/Export : cet agent se charge d'importer et d'exporter le contenu de
 * la mémoire.
 */
function ncAgent_ImportExport(){
	this.inData = null;
	this.inData_site = null;
	this.XMLdoc = window.top.document.implementation.createDocument("","", null);
	this.openUrlsList = function(){
		var texte = nc_ui.sb.getElementById("nc_OpenList").value;
		var urlsList = texte.split(/[\n,;]/);
		for(var i=0; i<urlsList.length; i++){
			var url = urlsList[i].replace(" ", "");
			if(url!= ""){
				nc_parasit.goToURL(url, "tab");
			}
		}
	}
	this.importHeuristicsXML = function(){
		// Récupération du répertoire de l'extension
		var id = "navicrawler@webatlas.fr";
		var ncHeurXMLDir = Components.classes["@mozilla.org/extensions/manager;1"]
                    .getService(Components.interfaces.nsIExtensionManager)
                    .getInstallLocation(id)
                    .getItemLocation(id);
		var ncHeurXML = Components.classes["@mozilla.org/extensions/manager;1"]
                    .getService(Components.interfaces.nsIExtensionManager)
                    .getInstallLocation(id)
                    .getItemLocation(id);
		// Ciblage du fichier d'heuristiques : ncHeurXML est ce fichier
		ncHeurXMLDir.append("chrome");
		ncHeurXMLDir.append("chromeFiles");
		ncHeurXMLDir.append("content");
		ncHeurXML.append("chrome");
		ncHeurXML.append("chromeFiles");
		ncHeurXML.append("content");
		ncHeurXML.append("heuristiques.xml")
		//alert(ncHeurXML.path);
		
		// Import du fichier
		var nsIFilePicker = Components.interfaces.nsIFilePicker;

		var fp = Components.classes["@mozilla.org/filepicker;1"]
			           .createInstance(nsIFilePicker);
		fp.init(window, nc_locale.GetStringFromName("io.openXML"), nsIFilePicker.modeOpen);
		fp.appendFilter("XML","*.xml");
		
		var rv = fp.show();
		if (rv == nsIFilePicker.returnOK){
			var file = fp.file;
			ncHeurXML.remove(false);
			file.copyTo(ncHeurXMLDir, "heuristiques.xml");
			setTimeout(nc_io.private_importHeuristicsXML_finalize, 1024);
		}		
	}
	this.private_importHeuristicsXML_finalize = function(){
			nc_heuristiques.LoadXML("chrome://broly/content/heuristiques.xml");
			alert("Heuristiques Importées.");
	}
	this.exportHeuristicsXML = function(){
		// Lecture du XML en mémoire
		var ioService=Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService);
		var scriptableStream=Components
			.classes["@mozilla.org/scriptableinputstream;1"]
			.getService(Components.interfaces.nsIScriptableInputStream);
		
		var channel=ioService.newChannel("chrome://broly/content/heuristiques.xml",null,null);
		var input=channel.open();
		scriptableStream.init(input);
		var xmlStr=scriptableStream.read(input.available());
		scriptableStream.close();
		input.close(); 
		
		// Ecriture
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"]
			           .createInstance(nsIFilePicker);
		fp.init(window, nc_locale.GetStringFromName("io.heurXMLexport"), nsIFilePicker.modeSave);
		fp.appendFilter("XML","*.xml");
		fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
		var rv = fp.show();
		if (rv != nsIFilePicker.returnCancel){
			var file = fp.file;
	  		var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			                         .createInstance(Components.interfaces.nsIFileOutputStream);
			if(!file.exists()){
				if(file.leafName.split('.').length==1){
					file.leafName += ".xml";
				} else if(file.leafName.split('.').length==2){
					file.leafName = file.leafName.split('.')[0] + ".xml";
				}
			}
			// use 0x02 | 0x10 to open file for appending.
			foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
			foStream.write(xmlStr, xmlStr.length);
			foStream.close();
			alert(nc_locale.GetStringFromName("io.heurXMLexportMessage")+file.leafName);
		}
	}
	this.importer = function(){
		var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                        .getService(Components.interfaces.nsIPromptService);
		var check = {value: false};
		var result = prompts.confirmCheck(window, nc_locale.GetStringFromName("io.askResetTitle"), nc_locale.GetStringFromName("io.askResetMessage"), nc_locale.GetStringFromName("io.askResetCheck"), check);
		if(result){
			if (!check.value)
				nc_resetAll();
			var nsIFilePicker = Components.interfaces.nsIFilePicker;
			
			var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
			fp.init(window, nc_locale.GetStringFromName("io.openWXSF"), nsIFilePicker.modeOpen);
			fp.appendFilter("WXSF (WebAtlas Xml Session File)", "*.wxsf");
			
			var rv = fp.show();
			if (rv == nsIFilePicker.returnOK) {
				nc_ui.activateProgress(100);
				nc_ui.stepProgress(nc_locale.GetStringFromName("io.fileLoading"));
				var file = fp.file;
				
				var url = Components.classes['@mozilla.org/network/io-service;1']
					.getService(Components.interfaces.nsIIOService)
					.newFileURI(file).spec; // url of file

				var req = new XMLHttpRequest();
				req.onload = function() {
					nc_io.XMLdoc = req.responseXML;
					nc_io.importWXSF();
				};
				req.open("GET", url, false);
				req.send(null);
			}
		}
	}
	this.importWXSF_temp_sitesArray = null;
	this.importWXSF_temp_liensArray = null;
	this.importWXSF = function(){
		nc_ui.stepProgress(nc_locale.GetStringFromName("io.fileAnalysed"));
		var session = nc_io.private_getUniqueSubnode(nc_io.XMLdoc, "session");
			var origine = nc_io.private_getUniqueSubnode(session, "origine");
			var date = nc_io.private_getUniqueSubnode(session, "date");
			var titre = nc_io.private_getOptionnalSubnode(session, "titre");
			var desc = nc_io.private_getOptionnalSubnode(session, "description");
			var groupeslibelles = nc_io.private_getUniqueSubnode(session, "groupeslibelles");
				var equivalence = {ff:[], wxsf:[]};
				var groupeslibellesArray = groupeslibelles.getElementsByTagName("groupelibelle");
				for(var gl=0; gl<groupeslibellesArray.length; gl++){
					var groupelibelleNom = decodeURIComponent(nc_io.private_getRequiredAtt(groupeslibellesArray[gl], "nom"));
					var gindex = nc_tagMan.ajouterGroupe(groupelibelleNom);
					equivalence.ff.push(""+gindex);
					equivalence.wxsf.push(""+gl);
				}
			var libelles = nc_io.private_getUniqueSubnode(session, "libelles");
				var libellesArray = libelles.getElementsByTagName("libelle");
				for(var l=0; l<libellesArray.length; l++){
					var libelleNom = decodeURIComponent(nc_io.private_getRequiredAtt(libellesArray[l], "nom"));
					var libelleGroupe = nc_io.private_getRequiredAtt(libellesArray[l], "groupe");
					nc_tagMan.ajouterLibelle(libelleNom);
					var integrationlibelleGroupe_index = equivalence.wxsf.indexOf(libelleGroupe);
					var integrationlibelleGroupe = equivalence.ff[integrationlibelleGroupe_index];
					nc_tagMan.setLibelleGroupe(hex_md5(libelleNom),integrationlibelleGroupe);
				}
		var sites = nc_io.private_getUniqueSubnode(nc_io.XMLdoc, "sites");
			var temp_sitesArray = sites.getElementsByTagName("site");
			nc_ui.setStepProgress(2, temp_sitesArray.length*2, nc_locale.GetStringFromName("io.sitesAnalyse"));
			nc_io.importWXSF_temp_sitesArray = [];
			for(var s=0; s<temp_sitesArray.length; s++){
				var site = temp_sitesArray[s];
				nc_io.importWXSF_temp_sitesArray.push(site);
			}
		var connexions = nc_io.private_getUniqueSubnode(nc_io.XMLdoc, "connexions");
		var temp_liensArray = connexions.getElementsByTagName("lien");
		nc_io.importWXSF_temp_liensArray = [];
		for(var l=0; l<temp_liensArray.length; l++){
			var lien = temp_liensArray[l];
			nc_io.importWXSF_temp_liensArray.push(lien);
		}
		nc_ui.addProgressListener(nc_io.importWXSF_stepWalk_nextSite);
		nc_io.importWXSF_stepWalk_nextSite();
	}
	this.importWXSF_stepWalk_nextSite = function(){
		if(nc_io.importWXSF_temp_sitesArray.length>0){
			var site = nc_io.importWXSF_temp_sitesArray.pop();
			var siteUrl = nc_io.private_getRequiredAtt(site, "url");
			if(siteUrl!="DUMMY"){
				if(nc_siteMan.getSite(siteUrl)==nc_siteMan.dummySite){
					nc_siteMan.createNewSite(siteUrl);
				}
				var siteEtat = nc_io.private_getRequiredAtt(site, "etat");
				if(siteEtat=="visite"){
					nc_siteMan.setVisited(siteUrl);
				} else if(siteEtat=="frontiere"){
					if(!nc_siteMan.isVisited(siteUrl)){
						nc_siteMan.setFrontier(siteUrl);
					}
				} else {
					if(!nc_siteMan.isVisited(siteUrl) && !nc_siteMan.isFrontier(siteUrl)){
						nc_siteMan.setVoisin(siteUrl);
					}
				}
				var classements = nc_io.private_getUniqueSubnode(site, "classements");
					var classementsArray = classements.getElementsByTagName("classement");
					for(var c=0; c<classementsArray.length; c++){
						var classementLibelle = decodeURIComponent(nc_io.private_getRequiredAtt(classementsArray[c], "libelle"));
						var classementEtat = nc_io.private_getRequiredAtt(classementsArray[c], "etat");
						var etatNum = (classementEtat=="oui")?(1):((classementEtat=="non")?(2):((classementEtat=="report")?(3):(-1)));
						if(etatNum>0){
							nc_tagMan.setSiteState(hex_md5(classementLibelle), siteUrl, etatNum);
						}
					}
				var pages = nc_io.private_getUniqueSubnode(site, "pages");
					var pagesArray = pages.getElementsByTagName("page");
					for(var p=0; p<pagesArray.length; p++){
						var pageUrl = unescape(nc_io.private_getRequiredAtt(pagesArray[p], "url"));
						var pageProf = nc_io.private_getRequiredAtt(pagesArray[p], "prof");
						var pageMarque = nc_io.private_getRequiredAtt(pagesArray[p], "marque");
						nc_pageMan.createNewPage(pageUrl, siteUrl, pageProf);
						nc_siteMan.addPage(siteUrl, pageUrl);
					}
				nc_ui.stepProgress(siteUrl);
			}
		} else {
			nc_ui.setStepProgress(nc_io.importWXSF_temp_sitesArray.length, nc_io.importWXSF_temp_sitesArray.length+nc_io.importWXSF_temp_liensArray.length, nc_locale.GetStringFromName("io.links"));
			nc_ui.addProgressListener(nc_io.importWXSF_stepWalk_nextLien);
			nc_io.importWXSF_stepWalk_nextLien();
		}
	}
	this.importWXSF_stepWalk_nextLien = function(){
		if(nc_io.importWXSF_temp_liensArray.length>0){
			var lien = nc_io.importWXSF_temp_liensArray.pop();
			var de = nc_io.private_getRequiredAtt(lien, "de");
			var a = nc_io.private_getRequiredAtt(lien, "a");
			if(de!="DUMMY" && a!="DUMMY"){
				nc_siteMan.addLink(de, a);
				nc_ui.stepProgress(de+" > "+a);
			} else {
				nc_ui.stepProgress(nc_locale.GetStringFromName("io.unknownLink"));
			}
		} else {
			nc_ui.removeProgressListener();
			nc_io.importWXSF_stepWalk_finalize();
		}
	}
	this.importWXSF_stepWalk_finalize = function(){
		this.importWXSF_temp_sitesArray = null;
		this.importWXSF_temp_liensArray = null;
		nc_ui.disableProgress();
		nc_ui.update();
	}
	this.private_getUniqueSubnode = function(elt, subnodeTagName){
		var nodes = elt.getElementsByTagName(subnodeTagName);
		if(nodes.length == 1){
			return nodes[0];
		} else {
			alert(nc_locale.GetStringFromName("io.errorWXSF")+nc_locale.GetStringFromName("io.errorNode")+" <"+subnodeTagName+">");
			return null;
		}
	}
	this.private_getOptionnalSubnode = function(elt, subnodeTagName){
		var nodes = elt.getElementsByTagName(subnodeTagName);
		if(nodes.length == 1){
			return nodes[0];
		}
		return false;
	}
	this.private_getRequiredAtt = function(node, attributeName){
		if(node.getAttribute(attributeName)){
			return node.getAttribute(attributeName);
		} else {
			alert(nc_locale.GetStringFromName("io.errorWXSF")+nc_locale.GetStringFromName("io.errorRequiredAtt")+" \""+attributeName+"\" "+nc_locale.GetStringFromName("io.errorRequiredAttOn")+" "+node.nodeName);
			return null;
		}
	}
	this.private_codeXML_inner = function(xmlNode){	// Code en XML uniquement ce qu'il y a dans le noeud
		var texte = "";
		for(var c=0; c<xmlNode.childNodes.length; c++){
			texte += nc_io.private_codeXML(xmlNode.childNodes[c]);
		}
		return texte;
	}
	this.private_codeXML = function(xmlNode){	// Code en XML le noeud et tout ce qu'il y a dedans
		if(xmlNode.nodeName == "#text"){
			texte = xmlNode.nodeValue;
		} else {
			texte = "<"+xmlNode.nodeName;
			if(xmlNode.hasAttributes()){
				for(var a=0; a<xmlNode.attributes.length; a++){
					var att = xmlNode.attributes[a];
					texte += " "+att.name+"=\""+att.value+"\"";
				}
			}
			texte += ">";
			for(var c=0; c<xmlNode.childNodes.length; c++){
				texte += nc_io.private_codeXML(xmlNode.childNodes[c]);
			}
			texte += "</"+xmlNode.nodeName+">";
		}
		return texte;
	}
	this.gdfclean = function(string){
		return string.replace(/[éêèë]/gi, "e").replace(/[àâä]/gi, "a").replace(/[îï]/gi, "i").replace(/[ôö]/gi, "o").replace(/[ùûü]/gi, "u").replace(/ç/gi, "c").replace(/[^a-z0-9_ ]/gi, " ");
	}
	this.exporterFlaggedPagesCSV = function(){
		var txt = "\"Url\",\"Site\",\"SiteId\"";
		for(var i=0; i<nc_siteMan.sitesArray.length; i++){
			var site = nc_siteMan.sitesArray[i];
			var sid = site.id;
			if(site.id != "dummy"){
				var slabel = site.label;
				var pages_flag = nc_siteMan.getPages_flag(slabel);
				for(var p=0; p<pages_flag.length; p++){
					txt += "\n\""+pages_flag[p]+"\",\""+slabel+"\",\""+site.id+"\"";
				}
			}
		}
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"]
			           .createInstance(nsIFilePicker);
		fp.init(window, nc_locale.GetStringFromName("io.exportSessionCSV"), nsIFilePicker.modeSave);
		fp.appendFilter("CSV (Table)","*.csv");
		fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
		var rv = fp.show();
		if (rv != nsIFilePicker.returnCancel){
			var file = fp.file;
			var fileLinks = fp.file;
	  		var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			                         .createInstance(Components.interfaces.nsIFileOutputStream);
			if(file.leafName.split('.').length==1){
				file.leafName += ".csv";
			} else if(file.leafName.split('.').length==2){
				file.leafName = file.leafName.split('.')[0] + ".csv";
			}
			if(!file.exists()){
				// use 0x02 | 0x10 to open file for appending.
				foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
				foStream.write(txt, txt.length);
				foStream.close();
				
				alert(nc_locale.GetStringFromName("io.exportMessage")+" "+file.leafName);
			}
		}
	}
	this.exporterPagesGraph = function(){
		var nodesTxt = 'nodedef>name VARCHAR,label VARCHAR,visitcount INTEGER';
		var edgesTxt = '\nedgedef>node1,node2,directed';
		var pages = nc_pageMan.getAllPages();
		for(var i=0; i<pages.length; i++){
			var page = pages[i];
			nodesTxt += "\n"+page.id+",\""+page.url+"\","+page.visitCount;
			for(var j=0; j<page.links.length; j++){
				var page2url = page.links[j];
				var page2 = nc_pageMan.getPage(page2url);
				if(page2.id != -1){
					edgesTxt += "\n"+page.id+","+page2.id+",directed";
				}
			}
		}
		var txt = nodesTxt + edgesTxt;
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"]
			           .createInstance(nsIFilePicker);
		fp.init(window, nc_locale.GetStringFromName("io.exportSessionCSV"), nsIFilePicker.modeSave);
		fp.appendFilter("GDF (Table)","*.gdf");
		fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
		var rv = fp.show();
		if (rv != nsIFilePicker.returnCancel){
			var file = fp.file;
			var fileLinks = fp.file;
	  		var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			                         .createInstance(Components.interfaces.nsIFileOutputStream);
			if(file.leafName.split('.').length==1){
				file.leafName += ".gdf";
			} else if(file.leafName.split('.').length==2){
				file.leafName = file.leafName.split('.')[0] + ".gdf";
			}
			if(!file.exists()){
				// use 0x02 | 0x10 to open file for appending.
				foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
				foStream.write(txt, txt.length);
				foStream.close();
				
				alert(nc_locale.GetStringFromName("io.exportMessage")+" "+file.leafName);
			}
		}
	}
	this.exporterGDF = function(){
		var exportVisite = nc_ui.getExportVisite();
		var exportVoisin = nc_ui.getExportVoisin();
		var exportFrontiere = nc_ui.getExportFrontiere();
		var exportScrapped = nc_ui.getExportScrapped();
		// NODES (def)
		var nodes = "nodedef>name VARCHAR,label VARCHAR,etat VARCHAR,nb_pages_visitees INTEGER, nb_pages_marquees VARCHAR, nodeType VARCHAR";
		// Groupes de libellés (et Libellés autonomes)
		var groupes = nc_tagMan.getGroupes();
		var libellesArray = nc_tagMan.getList();
		// Libellés autonomes
		var g = 0;
		for(var l=0; l<libellesArray.length; l++){
			var libelle = libellesArray[l];
			if(""+libelle.groupe == ""+g){
				// Libellé autonome
				nodes += ",LIBELLE_"+nc_tagMan.cleanLibelleText(libelle.nom)+" VARCHAR";
			}
		}
		// Groupes de libellés
		for(g = 1; g<groupes.length; g++){
			nodes += ",GROUPE_"+nc_tagMan.cleanLibelleText(groupes[g])+" VARCHAR";
		}
		// Scrapped data
		if(exportScrapped){
			for each(p in nc_heuristiques.data.siteProperties){
				nodes += ","+this.gdfclean(p).replace(" ","_") + " VARCHAR";
			}
			for each(p in nc_heuristiques.data.entProperties){
				nodes += ","+this.gdfclean(p).replace(" ","_") + " VARCHAR";
			}
		}
		// EDGES (def)
		var edges = "edgedef>node1 VARCHAR,node2 VARCHAR,directed BOOLEAN,hypertext BOOLEAN";
		// Scrapped data
		if(exportScrapped){
			for each(p in nc_heuristiques.data.linkTypes){
				edges += ","+this.gdfclean(p).replace(" ","_") + " BOOLEAN";
			}
		}
		// Build ScrappedSitesList
		var scrappedSitesLabels = [];
		var scrappedSitesScraps = [];
		for each (s in nc_heuristiques.data.sites){
			scrappedSitesLabels.push(s.domain);
			scrappedSitesScraps.push(s);
		}
		// prepare scrapped links list
		var scrappedLinks = [];
		var scrappedLinksProperties = [];
		// NODES
		for(var i=0; i<nc_siteMan.sitesArray.length; i++){
			var site = nc_siteMan.sitesArray[i];
			var sid = site.id;
			if(site.id != "dummy"){
				var slabel = site.label;
				var etat = (site.visited)?("visite"):((site.frontier)?("frontiere"):("voisin"));
				var pages = site.pages.length;
				var pages_flag = nc_siteMan.getPages_flag(slabel);
				if((site.visited && exportVisite) || (site.frontier && exportFrontiere) || (site.voisin && exportVoisin)){
					nodes += "\n"+sid+","+slabel+","+etat+","+pages+","+pages_flag.length+",site";
					// Libellés autonomes
					var sg = 0;
					for(var sl=0; sl<libellesArray.length; sl++){
						var slibelle = libellesArray[sl];
						if(""+slibelle.groupe == ""+sg){
							// Libellé autonome
							var lmd5 = slibelle.lmd5;
							var t = nc_tagMan.getSiteState(lmd5, slabel)
							var tagState = (t==1)?("oui"):((t==2)?("non"):((t==3)?("report"):("non-classe")));
							nodes += ","+tagState;
						}
					}
					// Groupes de libellés
					for(sg = 1; sg<groupes.length; sg++){
						var areAllReported = true;
						var areAllNotClassed = true;
						var chosenLibelle = null;
						var groupError = false;
						for(var sl=0; sl<libellesArray.length; sl++){
							var slibelle = libellesArray[sl];
							if(""+slibelle.groupe == ""+sg){
								// Libellé groupé
								var lmd5 = slibelle.lmd5;
								var t = nc_tagMan.getSiteState(lmd5, slabel)
								// NB : var tagState = (t==1)?("oui"):((t==2)?("non"):((t==3)?("report"):("non-classe")));
								//  Vérification de la cohérence du groupe
								if(t==1){
									// Libellé choisi
									if(chosenLibelle == null){
										chosenLibelle = slibelle.nom;
									} else {
										groupError = true;
									}
									areAllReported = false;
									areAllNotClassed = false;
								} else if(t==2){
									areAllReported = false;
									areAllNotClassed = false;
								} else if(t==3){
									areAllNotClassed = false;
								} else {
									areAllReported = false;
								}
							}
						}
						if((chosenLibelle==null && !areAllReported && !areAllNotClassed) || (areAllReported && areAllNotClassed)){
							groupError = true;
						}
						if(groupError){
							nodes += ",erreur_groupe";
						}else{
							if(chosenLibelle != null){
								nodes += ","+nc_tagMan.cleanLibelleText(chosenLibelle);
							} else {
								if(areAllReported){
									nodes += ",report";
								} else {
									nodes += ",non-classe";
								}
							}
						}
					}
					// Scrapped properties
					if (exportScrapped) {
						// Check if site has been scrapped
						var index = scrappedSitesLabels.indexOf(slabel);
						if(index>=0){
							var s = scrappedSitesScraps[index];
							// build properties for this site
							var propNames = [];
							var propValues = [];
							for each(p in s.properties){
								propNames.push(p.name);
								propValues.push(p.value);
							}
							for each(p in nc_heuristiques.data.siteProperties){
								var pindex = propNames.indexOf(p);
								if (pindex >= 0) {
									nodes += ",\""+this.gdfclean(propValues[pindex]).replace(" ", "_")+"\"";
								}
								else {
									nodes += ",\"\"";
								}
							}
							for each(p in nc_heuristiques.data.entProperties){
								nodes += ",\"\"";
							}
							// links to other sites
							for each (sto in s.linksTo.site){
								var stoObj = nc_siteMan.getSite(sto.dmn);
								if (stoObj != nc_siteMan.dummySite && ((stoObj.visited && exportVisite) || (stoObj.frontier && exportFrontiere) || (stoObj.voisin && exportVoisin))) {
									var link = sid + "," + stoObj.id;
									var lindex = scrappedLinks.indexOf(link);
									if(lindex>=0){
										var pindex = scrappedLinksProperties[lindex].indexOf(sto.relation);
										if(pindex<0)
											scrappedLinksProperties[lindex].push(sto.relation)
									} else {
										scrappedLinks.push(link);
										scrappedLinksProperties.push([sto.relation]);
									}
								}
							}
							// links to other entities
							for each (eto in s.linksTo.entity){
								// get Entity Object
								for (var toTypeIndex = 0; toTypeIndex < nc_heuristiques.data.entTypes.length; toTypeIndex++) {
									var toType = nc_heuristiques.data.entTypes[toTypeIndex];
									if(toType == eto.type){
										for each(etoObj in nc_heuristiques.data.entTypesEntities[toTypeIndex]){
											if(etoObj.name == eto.entity){
												// Ok, we now have the pointed entity object etoObj
												var link = sid + ",nce" + etoObj.id;
												var lindex = scrappedLinks.indexOf(link);
												if(lindex>=0){
													var pindex = scrappedLinksProperties[lindex].indexOf(eto.relation);
													if(pindex<0)
														scrappedLinksProperties[lindex].push(eto.relation)
												} else {
													scrappedLinks.push(link);
													scrappedLinksProperties.push([eto.relation]);
												}
												break;
											}
										}
									break;
									}
								}
							}
						} else {
							for each(p in nc_heuristiques.data.siteProperties){
								nodes += ",\"\"";
							}
							for each(p in nc_heuristiques.data.entProperties){
								nodes += ",\"\"";
							}
						}
					}
					// Edges (is connected to... ie. by Hypertext)
					for(var j=0; j<site.linksTo.length; j++){
						var sto = nc_siteMan.getSite(site.linksTo[j]);
						if(sto.id != "dummy"){
							if((sto.visited && exportVisite) || (sto.frontier && exportFrontiere) || (sto.voisin && exportVoisin)){
								var link = sid + "," + sto.id;
								var lindex = scrappedLinks.indexOf(link);
								if(lindex>=0){
									var pindex = scrappedLinksProperties[lindex].indexOf("hypertext");
									if(pindex<0)
										scrappedLinksProperties[lindex].push("hypertext");
								} else {
									scrappedLinks.push(link);
									scrappedLinksProperties.push(["hypertext"]);
								}
							}
						}
					}
				}
			}
		}
		// ENTITIES
		if(exportScrapped){
			for(var typeIndex=0; typeIndex<nc_heuristiques.data.entTypes.length; typeIndex++){
				var type = nc_heuristiques.data.entTypes[typeIndex];
				for(var entIndex=0; entIndex<nc_heuristiques.data.entTypesEntities[typeIndex].length; entIndex++){
					var entityObject = nc_heuristiques.data.entTypesEntities[typeIndex][entIndex];
					var entity = "nce"+entityObject.id+",\""+this.gdfclean(entityObject.name)+"\",,,,\""+this.gdfclean(type)+"\"";
					var propNames = [];
					var propValues = [];
					for each(p in entityObject.properties){
						propNames.push(p.name);
						propValues.push(p.value);
					}
					for each(p in nc_heuristiques.data.siteProperties){
						nodes += ",\"\"";
					}
					for each(p in nc_heuristiques.data.entProperties){
						var pindex = propNames.indexOf(p);
						if (pindex >= 0) {
							entity += ",\""+this.gdfclean(propValues[pindex])+"\"";
						}
						else {
							entity += ",\"\"";
						}
					}
					nodes += "\n"+entity;
					// links to other sites
					for each (sto in entityObject.linksTo.site){
						var stoObj = nc_siteMan.getSite(sto.dmn);
						if (stoObj != nc_siteMan.dummySite && ((stoObj.visited && exportVisite) || (stoObj.frontier && exportFrontiere) || (stoObj.voisin && exportVoisin))) {
							var link = "nce"+entityObject.id + "," + stoObj.id;
							var lindex = scrappedLinks.indexOf(link);
							if(lindex>=0){
								var pindex = scrappedLinksProperties[lindex].indexOf(sto.relation);
								if(pindex<0)
									scrappedLinksProperties[lindex].push(sto.relation)
							} else {
								scrappedLinks.push(link);
								scrappedLinksProperties.push([sto.relation]);
							}
						}
					}
					// links to other entities
					for each (eto in entityObject.linksTo.entity){
						// get Entity Object
						for (var toTypeIndex = 0; toTypeIndex < nc_heuristiques.data.entTypes.length; toTypeIndex++) {
							var toType = nc_heuristiques.data.entTypes[toTypeIndex];
							if(toType == eto.type){
								for each(etoObj in nc_heuristiques.data.entTypesEntities[toTypeIndex]){
									if(etoObj.name == eto.entity){
										// Ok, we now have the pointed entity object etoObj
										var link = "nce"+entityObject.id + ",nce" + etoObj.id;
										var lindex = scrappedLinks.indexOf(link);
										if(lindex>=0){
											var pindex = scrappedLinksProperties[lindex].indexOf(eto.relation);
											if(pindex<0)
												scrappedLinksProperties[lindex].push(eto.relation)
										} else {
											scrappedLinks.push(link);
											scrappedLinksProperties.push([eto.relation]);
										}
										break;
									}
								}
							break;
							}
						}
					}
				}
			}
		}
		// EDGES
		for(var lindex=0; lindex<scrappedLinks.length; lindex++){
			var edge = scrappedLinks[lindex];
			edge += ",true";	// directed
			var properties = scrappedLinksProperties[lindex];
			// hypertext (normal link)
			edge += ","+(properties.indexOf("hypertext")>=0)
			if(exportScrapped){
				for each(p in nc_heuristiques.data.linkTypes){
					edge += ","+(properties.indexOf(p)>=0);
				}
			}
			edges += "\n"+edge;
		}
		var data = nodes+"\n"+edges;
		
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"]
			           .createInstance(nsIFilePicker);
		fp.init(window, nc_locale.GetStringFromName("io.exportGDF"), nsIFilePicker.modeSave);
		fp.appendFilter("GDF (Guess)","*.gdf");
		fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
		var rv = fp.show();
		if (rv != nsIFilePicker.returnCancel){
			var file = fp.file;
	  		var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			                         .createInstance(Components.interfaces.nsIFileOutputStream);
			if(!file.exists()){
				if(file.leafName.split('.').length==1){
					file.leafName += ".gdf";
				} else if(file.leafName.split('.').length==2){
					file.leafName = file.leafName.split('.')[0] + ".gdf";
				}
			}
			// use 0x02 | 0x10 to open file for appending.
			foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
			foStream.write(data, data.length);
			foStream.close();
			alert(nc_locale.GetStringFromName("io.exportMessage")+" "+file.leafName);
		}
	}
	
	this.exporterNET = function(){
		if(nc_ui.getExportScrapped()){
			alert(nc_locale.GetStringFromName("io.scrapTempMessage"));
		}
		var nodes = "*Vertices "+nc_siteMan.sitesArray.length;
		var edges = "*Arcs";
		var exportVisite = nc_ui.getExportVisite();
		var exportVoisin = nc_ui.getExportVoisin();
		var exportFrontiere = nc_ui.getExportFrontiere();
		// Noeuds
		for(var i=0; i<nc_siteMan.sitesArray.length; i++){
			var site = nc_siteMan.sitesArray[i];
			var sid = site.id;
			if(sid != "dummy"){
				sid = sid.replace("ncs", "");
				var slabel = site.label;
				if((site.visited && exportVisite) || (site.frontier && exportFrontiere) || (site.voisin && exportVoisin)){
					nodes += "\r"+sid+" \""+slabel+"\"";
					for(var j=0; j<site.linksTo.length; j++){
						var sto = nc_siteMan.getSite(site.linksTo[j]);
						
						if(sto.id != "dummy"){
							if((sto.visited && exportVisite) || (sto.frontier && exportFrontiere) || (sto.voisin && exportVoisin)){
								edges += "\r"+sid+" "+sto.id.replace("ncs", "");;
							}
						}
					}
				}
			}
		}
		var data = nodes+"\r"+edges;
		
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"]
			           .createInstance(nsIFilePicker);
		fp.init(window, nc_locale.GetStringFromName("io.exportNET"), nsIFilePicker.modeSave);
		fp.appendFilter("NET (Pajek)","*.net");
		fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
		var rv = fp.show();
		if (rv != nsIFilePicker.returnCancel){
			var file = fp.file;
	  		var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			                         .createInstance(Components.interfaces.nsIFileOutputStream);
			if(!file.exists()){
				if(file.leafName.split('.').length==1){
					file.leafName += ".net";
				} else if(file.leafName.split('.').length==2){
					file.leafName = file.leafName.split('.')[0] + ".net";
				}
			}
			// use 0x02 | 0x10 to open file for appending.
			foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
			foStream.write(data, data.length);
			foStream.close();
			alert(nc_locale.GetStringFromName("io.exportMessage")+" "+file.leafName);
		}
	}
	this.csvclean = function(string){
		return string.replace("\"", "\"\"", "gi");
	}
	this.exporterCSV = function(){
		var exportVisite = nc_ui.getExportVisite();
		var exportVoisin = nc_ui.getExportVoisin();
		var exportFrontiere = nc_ui.getExportFrontiere();
		var exportScrapped = nc_ui.getExportScrapped();
		// NODES (def)
		var nodes = "Id,Label,Corpus Status,Browsed Pages Count,Flagges Pages Count,Node Type";
		// Groupes de libellés (et Libellés autonomes)
		var groupes = nc_tagMan.getGroupes();
		var libellesArray = nc_tagMan.getList();
		// Libellés autonomes
		var g = 0;
		for(var l=0; l<libellesArray.length; l++){
			var libelle = libellesArray[l];
			if(""+libelle.groupe == ""+g){
				// Libellé autonome
				nodes += ",TAG "+nc_tagMan.cleanLibelleText(libelle.nom);
			}
		}
		// Groupes de libellés
		for(g = 1; g<groupes.length; g++){
			nodes += ",TagGROUP"+nc_tagMan.cleanLibelleText(groupes[g]);
		}
		// Scrapped data
		if(exportScrapped){
			for each(p in nc_heuristiques.data.siteProperties){
				nodes += ","+this.csvclean(p);
			}
			for each(p in nc_heuristiques.data.entProperties){
				nodes += ","+this.csvclean(p);
			}
		}
		// EDGES (def)
		var edges = "Source Id,Target Id,Source Label,Target Label,Hypertext";
		// Scrapped data
		if(exportScrapped){
			for each(p in nc_heuristiques.data.linkTypes){
				edges += ","+this.csvclean(p);
			}
		}
		// Build ScrappedSitesList
		var scrappedSitesLabels = [];
		var scrappedSitesScraps = [];
		for each (s in nc_heuristiques.data.sites){
			scrappedSitesLabels.push(s.domain);
			scrappedSitesScraps.push(s);
		}
		// prepare scrapped links list
		var scrappedLinks = [];
		var scrappedLinksProperties = [];
		// NODES
		for(var i=0; i<nc_siteMan.sitesArray.length; i++){
			var site = nc_siteMan.sitesArray[i];
			var sid = site.id;
			if(site.id != "dummy"){
				var slabel = site.label;
				var etat = (site.visited)?("visite"):((site.frontier)?("frontiere"):("voisin"));
				var pages = site.pages.length;
				var pages_flag = nc_siteMan.getPages_flag(slabel);
				if((site.visited && exportVisite) || (site.frontier && exportFrontiere) || (site.voisin && exportVoisin)){
					nodes += "\n"+sid+","+slabel+","+etat+","+pages+","+pages_flag.length+",site";
					// Libellés autonomes
					var sg = 0;
					for(var sl=0; sl<libellesArray.length; sl++){
						var slibelle = libellesArray[sl];
						if(""+slibelle.groupe == ""+sg){
							// Libellé autonome
							var lmd5 = slibelle.lmd5;
							var t = nc_tagMan.getSiteState(lmd5, slabel)
							var tagState = (t==1)?("oui"):((t==2)?("non"):((t==3)?("report"):("non-classe")));
							nodes += ","+tagState;
						}
					}
					// Groupes de libellés
					for(sg = 1; sg<groupes.length; sg++){
						var areAllReported = true;
						var areAllNotClassed = true;
						var chosenLibelle = null;
						var groupError = false;
						for(var sl=0; sl<libellesArray.length; sl++){
							var slibelle = libellesArray[sl];
							if(""+slibelle.groupe == ""+sg){
								// Libellé groupé
								var lmd5 = slibelle.lmd5;
								var t = nc_tagMan.getSiteState(lmd5, slabel)
								// NB : var tagState = (t==1)?("oui"):((t==2)?("non"):((t==3)?("report"):("non-classe")));
								//  Vérification de la cohérence du groupe
								if(t==1){
									// Libellé choisi
									if(chosenLibelle == null){
										chosenLibelle = slibelle.nom;
									} else {
										groupError = true;
									}
									areAllReported = false;
									areAllNotClassed = false;
								} else if(t==2){
									areAllReported = false;
									areAllNotClassed = false;
								} else if(t==3){
									areAllNotClassed = false;
								} else {
									areAllReported = false;
								}
							}
						}
						if((chosenLibelle==null && !areAllReported && !areAllNotClassed) || (areAllReported && areAllNotClassed)){
							groupError = true;
						}
						if(groupError){
							nodes += ",erreur_groupe";
						}else{
							if(chosenLibelle != null){
								nodes += ","+nc_tagMan.cleanLibelleText(chosenLibelle);
							} else {
								if(areAllReported){
									nodes += ",report";
								} else {
									nodes += ",non-classe";
								}
							}
						}
					}
					// Scrapped properties
					if (exportScrapped) {
						// Check if site has been scrapped
						var index = scrappedSitesLabels.indexOf(slabel);
						if(index>=0){
							var s = scrappedSitesScraps[index];
							// build properties for this site
							var propNames = [];
							var propValues = [];
							for each(p in s.properties){
								propNames.push(p.name);
								propValues.push(p.value);
							}
							for each(p in nc_heuristiques.data.siteProperties){
								var pindex = propNames.indexOf(p);
								if (pindex >= 0) {
									nodes += ",\""+this.csvclean(propValues[pindex])+"\"";
								}
								else {
									nodes += ",\"\"";
								}
							}
							for each(p in nc_heuristiques.data.entProperties){
								nodes += ",\"\"";
							}
							// links to other sites
							for each (sto in s.linksTo.site){
								var stoObj = nc_siteMan.getSite(sto.dmn);
								if (stoObj != nc_siteMan.dummySite && ((stoObj.visited && exportVisite) || (stoObj.frontier && exportFrontiere) || (stoObj.voisin && exportVoisin))) {
									var link = sid + "," + stoObj.id + ",\"" + slabel + "\",\"" + sto.dmn + "\"";
									var lindex = scrappedLinks.indexOf(link);
									if(lindex>=0){
										var pindex = scrappedLinksProperties[lindex].indexOf(sto.relation);
										if(pindex<0)
											scrappedLinksProperties[lindex].push(sto.relation)
									} else {
										scrappedLinks.push(link);
										scrappedLinksProperties.push([sto.relation]);
									}
								}
							}
							// links to other entities
							for each (eto in s.linksTo.entity){
								// get Entity Object
								for (var toTypeIndex = 0; toTypeIndex < nc_heuristiques.data.entTypes.length; toTypeIndex++) {
									var toType = nc_heuristiques.data.entTypes[toTypeIndex];
									if(toType == eto.type){
										for each(etoObj in nc_heuristiques.data.entTypesEntities[toTypeIndex]){
											if(etoObj.name == eto.entity){
												// Ok, we now have the pointed entity object etoObj
												var link = sid + ",nce" + etoObj.id + ",\"" + slabel + "\",\"" + this.csvclean(etoObj.name) + "\"";
												var lindex = scrappedLinks.indexOf(link);
												if(lindex>=0){
													var pindex = scrappedLinksProperties[lindex].indexOf(eto.relation);
													if(pindex<0)
														scrappedLinksProperties[lindex].push(eto.relation)
												} else {
													scrappedLinks.push(link);
													scrappedLinksProperties.push([eto.relation]);
												}
												break;
											}
										}
									break;
									}
								}
							}
						} else {
							for each(p in nc_heuristiques.data.siteProperties){
								nodes += ",\"\"";
							}
							for each(p in nc_heuristiques.data.entProperties){
								nodes += ",\"\"";
							}
						}
					}
					// Edges (is connected to... ie. by Hypertext)
					for(var j=0; j<site.linksTo.length; j++){
						var sto = nc_siteMan.getSite(site.linksTo[j]);
						if(sto.id != "dummy"){
							if((sto.visited && exportVisite) || (sto.frontier && exportFrontiere) || (sto.voisin && exportVoisin)){
								var link = sid + "," + sto.id + ",\"" + slabel + "\",\"" + sto.label + "\"";
								var lindex = scrappedLinks.indexOf(link);
								if(lindex>=0){
									var pindex = scrappedLinksProperties[lindex].indexOf("hypertext");
									if(pindex<0)
										scrappedLinksProperties[lindex].push("hypertext");
								} else {
									scrappedLinks.push(link);
									scrappedLinksProperties.push(["hypertext"]);
								}
							}
						}
					}
				}
			}
		}
		// ENTITIES
		if(exportScrapped){
			for(var typeIndex=0; typeIndex<nc_heuristiques.data.entTypes.length; typeIndex++){
				var type = nc_heuristiques.data.entTypes[typeIndex];
				for(var entIndex=0; entIndex<nc_heuristiques.data.entTypesEntities[typeIndex].length; entIndex++){
					var entityObject = nc_heuristiques.data.entTypesEntities[typeIndex][entIndex];
					var entity = "nce"+entityObject.id+",\""+this.csvclean(entityObject.name)+"\",,,,\""+this.csvclean(type)+"\"";
					var propNames = [];
					var propValues = [];
					for each(p in entityObject.properties){
						propNames.push(p.name);
						propValues.push(p.value);
					}
					for each(p in nc_heuristiques.data.siteProperties){
						nodes += ",\"\"";
					}
					for each(p in nc_heuristiques.data.entProperties){
						var pindex = propNames.indexOf(p);
						if (pindex >= 0) {
							entity += ",\""+this.csvclean(propValues[pindex])+"\"";
						}
						else {
							entity += ",\"\"";
						}
					}
					nodes += "\n"+entity;
					// links to other sites
					for each (sto in entityObject.linksTo.site){
						var stoObj = nc_siteMan.getSite(sto.dmn);
						if (stoObj != nc_siteMan.dummySite && ((stoObj.visited && exportVisite) || (stoObj.frontier && exportFrontiere) || (stoObj.voisin && exportVoisin))) {
							var link = "nce" + entityObject.id + "," + stoObj.id + ",\"" + this.csvclean(entityObject.name) + "\",\"" + sto.dmn + "\"";
							var lindex = scrappedLinks.indexOf(link);
							if(lindex>=0){
								var pindex = scrappedLinksProperties[lindex].indexOf(sto.relation);
								if(pindex<0)
									scrappedLinksProperties[lindex].push(sto.relation)
							} else {
								scrappedLinks.push(link);
								scrappedLinksProperties.push([sto.relation]);
							}
						}
					}
					// links to other entities
					for each (eto in entityObject.linksTo.entity){
						// get Entity Object
						for (var toTypeIndex = 0; toTypeIndex < nc_heuristiques.data.entTypes.length; toTypeIndex++) {
							var toType = nc_heuristiques.data.entTypes[toTypeIndex];
							if(toType == eto.type){
								for each(etoObj in nc_heuristiques.data.entTypesEntities[toTypeIndex]){
									if(etoObj.name == eto.entity){
										// Ok, we now have the pointed entity object etoObj
										var link = "nce"+entityObject.id + ",nce" + etoObj.id + ",\"" + this.csvclean(entityObject.name) + "\",\"" + this.csvclean(etoObj.name) + "\"";
										var lindex = scrappedLinks.indexOf(link);
										if(lindex>=0){
											var pindex = scrappedLinksProperties[lindex].indexOf(eto.relation);
											if(pindex<0)
												scrappedLinksProperties[lindex].push(eto.relation)
										} else {
											scrappedLinks.push(link);
											scrappedLinksProperties.push([eto.relation]);
										}
										break;
									}
								}
							break;
							}
						}
					}
				}
			}
		}
		// EDGES
		for(var lindex=0; lindex<scrappedLinks.length; lindex++){
			var edge = scrappedLinks[lindex];
			var properties = scrappedLinksProperties[lindex];
			// hypertext (normal link)
			edge += ","+(properties.indexOf("hypertext")>=0)
			if(exportScrapped){
				for each(p in nc_heuristiques.data.linkTypes){
					edge += ","+(properties.indexOf(p)>=0);
				}
			}
			edges += "\n"+edge;
		}
		
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"]
			           .createInstance(nsIFilePicker);
		fp.init(window, nc_locale.GetStringFromName("io.exportSessionCSV"), nsIFilePicker.modeSave);
		fp.appendFilter("CSV (Table)","*.csv");
		fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
		var rv = fp.show();
		if (rv != nsIFilePicker.returnCancel){
			var file = fp.file;
			var fileLinks = fp.file;
	  		var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			                         .createInstance(Components.interfaces.nsIFileOutputStream);
			// Nodes
			if(file.leafName.split('.').length==1){
				file.leafName += ".csv";
			} else if(file.leafName.split('.').length==2){
				file.leafName = file.leafName.split('.')[0] + ".csv";
			}
			if(!file.exists()){
				// use 0x02 | 0x10 to open file for appending.
				foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
				foStream.write(nodes, nodes.length);
				foStream.close();
				
				alert(nc_locale.GetStringFromName("io.exportMessage")+" "+file.leafName);
			}

			// Edges
			foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			                         .createInstance(Components.interfaces.nsIFileOutputStream);
			if(fileLinks.leafName.split('.').length==1){
				fileLinks.leafName += " Links.csv";
			} else if(fileLinks.leafName.split('.').length==2){
				fileLinks.leafName = file.leafName.split('.')[0] + " Links.csv";
			}
			if(!fileLinks.exists()){
				// use 0x02 | 0x10 to open file for appending.
				foStream.init(fileLinks, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
				foStream.write(edges, edges.length);
				foStream.close();
	
				alert(nc_locale.GetStringFromName("io.exportMessage")+" "+fileLinks.leafName);
			}
		}
	}
	
	this.private_exportWXSF_temp_session = "";
	this.private_exportWXSF_temp_sites = new Array();
	this.private_exportWXSF_temp_sites_exported = new Array();
	this.private_exportWXSF_temp_sitesnode = "";
	this.private_exportWXSF_temp_liensnode = "";
	
	this.exporterWXSF = function(){
		if(nc_ui.getExportScrapped()){
			alert(nc_locale.GetStringFromName("io.scrapTempMessage"));
		}
		nc_ui.activateProgress(100);
		/** sites **/
		nc_io.private_exportWXSF_temp_sites_exported = new Array();	// Précaution : le xml ne supporte pas les doublons de sites.
		for(s = 0; s<nc_siteMan.sitesArray.length; s++){
			nc_io.private_exportWXSF_temp_sites.push(nc_siteMan.sitesArray[s]);
		}
		nc_ui.setStepProgress(1, 2+nc_io.private_exportWXSF_temp_sites.length, "Analyse...");
		nc_ui.addProgressListener(nc_io.exportWXSF_process_session);
		nc_ui.stepProgress(nc_locale.GetStringFromName("io.session"));
	}
	
	this.exportWXSF_process_session = function(){
		/** session **/
		nc_io.private_exportWXSF_temp_session += "\n<origine>Navicrawler</origine>";
		var date = new Date();
		nc_io.private_exportWXSF_temp_session += "\n<date>"+date+"</date>";
		nc_io.private_exportWXSF_temp_session += "\n<groupeslibelles>";
		for(var g=0; g<nc_tagMan.getGroupes().length; g++){
			var groupe = nc_tagMan.getGroupes()[g];
			nc_io.private_exportWXSF_temp_session += "\n<groupelibelle nom=\""+encodeURIComponent(groupe)+"\"/>";
		}
		nc_io.private_exportWXSF_temp_session += "</groupeslibelles>";
		nc_io.private_exportWXSF_temp_session += "\n<libelles>";
		for(var t=0; t<nc_tagMan.getList().length; t++){
			var libelle = nc_tagMan.getList()[t].nom;
			var groupe = nc_tagMan.getList()[t].groupe;
			nc_io.private_exportWXSF_temp_session += "\n<libelle nom=\""+encodeURIComponent(libelle)+"\" groupe=\""+groupe+"\"/>";
		}
		nc_io.private_exportWXSF_temp_session += "</libelles>";
		//alert(nc_io.private_exportWXSF_temp_session);
		
		nc_ui.addProgressListener(nc_io.exportWXSF_process_sites);
		nc_ui.stepProgress("Sites...");
	}
	this.exportWXSF_process_sites = function(){
		if(nc_io.private_exportWXSF_temp_sites.length>0){
			var exportVisite = nc_ui.getExportVisite();
			var exportVoisin = nc_ui.getExportVoisin();
			var exportFrontiere = nc_ui.getExportFrontiere();
			var site = nc_io.private_exportWXSF_temp_sites.pop();

			var surl = site.label.replace("&", "&amp;", "g").replace("<", "&lt;", "g").replace(">", "&gt;", "g");
			if(nc_io.private_exportWXSF_temp_sites_exported.indexOf(surl)<0){
				nc_io.private_exportWXSF_temp_sites_exported.push(surl);
				var etat = (site.visited)?("visite"):((site.frontier)?("frontiere"):("voisin"));
				var pages = site.pages;
				var descriptor = site.descriptor;
				if((site.visited && exportVisite) || (site.frontier && exportFrontiere) || (site.voisin && exportVoisin)){
					nc_io.private_exportWXSF_temp_sitesnode += "\n<site url=\""+surl+"\" etat=\""+etat+"\">";
					nc_io.private_exportWXSF_temp_sitesnode += "\n<classements>";
					for(var t=0; t<nc_tagMan.getList().length; t++){
						var libelle = nc_tagMan.getList()[t].nom;
						var lmd5 = nc_tagMan.getList()[t].lmd5;
						var etat = nc_tagMan.getSiteState(lmd5, surl);
						var etatText = (etat==1)?("oui"):((etat==2)?("non"):((etat==3)?("report"):("non-classe")));
						nc_io.private_exportWXSF_temp_sitesnode += "\n<classement libelle=\""+encodeURIComponent(libelle)+"\" etat=\""+etatText+"\"/>";
					}
					nc_io.private_exportWXSF_temp_sitesnode += "</classements>";
					nc_io.private_exportWXSF_temp_sitesnode += "\n<pages>";
					for(var p=0; p<pages.length; p++){
						var page = nc_pageMan.get(pages[p], surl);
						var url = page.url;
						var prof = page.prof;
						var flag = (page.flag)?("oui"):("non");
						nc_io.private_exportWXSF_temp_sitesnode += "\n<page url=\""+encodeURIComponent(url)+"\" prof=\""+prof+"\" marque=\""+flag+"\"/>";
					}
					nc_io.private_exportWXSF_temp_sitesnode += "</pages>";
					nc_io.private_exportWXSF_temp_sitesnode += "\n<description_heuristique><![CDATA[";
					nc_io.private_exportWXSF_temp_sitesnode += "]]></description_heuristique>";
					nc_io.private_exportWXSF_temp_sitesnode += "\n</site>";				
					/** liens **/
					for(var l=0; l<site.linksTo.length; l++){
						var sto = nc_siteMan.getSite(site.linksTo[l]);
						if((sto.visited && exportVisite) || (sto.frontier && exportFrontiere) || (sto.voisin && exportVoisin)){
							nc_io.private_exportWXSF_temp_liensnode += "\n<lien de=\""+surl+"\" a=\""+sto.label.replace("&", "&amp;", "g").replace("<", "&lt;", "g").replace(">", "&gt;", "g")+"\"></lien>";
						}
					}
				}
			}
			nc_ui.stepProgress(surl);
		} else {
			nc_ui.addProgressListener(nc_io.exportWXSF_finalize);
			nc_ui.stepProgress(nc_locale.GetStringFromName("io.writing"));
		}
	}
	this.exportWXSF_finalize = function(){
		var dtd = "<!DOCTYPE WebatlasXmlSessionFile [ \n";
		dtd += "	<!ELEMENT WebatlasXmlSessionFile (session,sites,connexions)> \n";
		dtd += "	<!ELEMENT session (origine,date,titre?,description?,libelles,groupeslibelles?)> \n";
		dtd += "		<!ELEMENT origine (#PCDATA)> \n";
		dtd += "		<!ELEMENT date (#PCDATA)> \n";
		dtd += "		<!ELEMENT titre (#PCDATA)> \n";
		dtd += "		<!ELEMENT description (#PCDATA)> \n";
		dtd += "		<!ELEMENT groupeslibelles (groupelibelle*)> \n";
		dtd += "			<!ELEMENT groupelibelle EMPTY> \n";
		dtd += "			<!ATTLIST groupelibelle \n";
		dtd += "				nom ID #REQUIRED \n";
		dtd += "			> \n";
		dtd += "		<!ELEMENT libelles (libelle*)> \n";
		dtd += "			<!ELEMENT libelle EMPTY> \n";
		dtd += "			<!ATTLIST libelle \n";
		dtd += "				nom ID #REQUIRED \n";
		dtd += "				groupe CDATA #IMPLIED \n";
		dtd += "			> \n";
		dtd += "	<!ELEMENT sites (site*)> \n";
		dtd += "		<!ELEMENT site (classements,pages,description_heuristique?)> \n";
		dtd += "		<!ATTLIST site \n";
		dtd += "			url ID #REQUIRED \n";
		dtd += "			etat (visite|voisin|frontiere) #REQUIRED \n";
		dtd += "		> \n";
		dtd += "			<!ELEMENT classements (classement*)> \n";
		dtd += "				<!ELEMENT classement EMPTY> \n";
		dtd += "				<!ATTLIST classement \n";
		dtd += "					libelle CDATA #REQUIRED \n";
		dtd += "					etat (oui|non|report|non-classe) #REQUIRED \n";
		dtd += "				> \n";
		dtd += "			<!ELEMENT pages (page*)> \n";
		dtd += "				<!ELEMENT page EMPTY> \n";
		dtd += "				<!ATTLIST page \n";
		dtd += "					url CDATA #REQUIRED \n";
		dtd += "					prof CDATA #REQUIRED \n";
		dtd += "					marque (oui|non) #REQUIRED \n";
		dtd += "				> \n";
		dtd += "			<!ELEMENT description_heuristique (vue*)> \n";
		dtd += "				<!ELEMENT vue ANY> \n";
		dtd += "				<!ATTLIST vue \n";
		dtd += "					date CDATA #REQUIRED \n";
		dtd += "					url CDATA #REQUIRED \n";
		dtd += "				> \n";
		dtd += "	<!ELEMENT connexions (lien*)> \n";
		dtd += "		<!ELEMENT lien EMPTY> \n";
		dtd += "		<!ATTLIST lien \n";
		dtd += "			de CDATA #REQUIRED \n";
		dtd += "			a CDATA #REQUIRED \n";
		dtd += "		> \n";
		dtd += "	]> \n";

		var data = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"+dtd+"\n<WebatlasXmlSessionFile>\n<session>"+nc_io.private_exportWXSF_temp_session+"\n</session>\n<sites>"+nc_io.private_exportWXSF_temp_sitesnode+"\n</sites>\n<connexions>"+nc_io.private_exportWXSF_temp_liensnode+"\n</connexions>\n</WebatlasXmlSessionFile>";
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"]
			           .createInstance(nsIFilePicker);
		fp.init(window, nc_locale.GetStringFromName("io.exportWXSF"), nsIFilePicker.modeSave);
		fp.appendFilter("WXSF (WebAtlas Xml Session File)","*.wxsf");
		fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
		var rv = fp.show();
		if (rv != nsIFilePicker.returnCancel){
			var file = fp.file;
	  		var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
			                         .createInstance(Components.interfaces.nsIFileOutputStream);
			if(!file.exists()){
				if(file.leafName.split('.').length==1){
					file.leafName += ".wxsf";
				} else if(file.leafName.split('.').length==2){
					file.leafName = file.leafName.split('.')[0] + ".wxsf";
				}
			}
			// use 0x02 | 0x10 to open file for appending.
			foStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0); // write, create, truncate
			foStream.write(data, data.length);
			foStream.close();
		}
		nc_io.private_exportWXSF_temp_session = null;
		nc_io.private_exportWXSF_temp_sites = new Array();
		nc_io.private_exportWXSF_temp_sites_exported = new Array();
		nc_io.private_exportWXSF_temp_sitesnode = "";
		nc_io.private_exportWXSF_temp_liensnode = "";
		
		nc_ui.disableProgress();
		nc_ui.update();
	}
}
/**
 * Agent mémoriel : cet agent se charge de retenir tout ce qu'on lui demande
 * et de le retrouver à la demande. Il concerne essentiellement des fonctions
 * pretique et les accès aux données "courantes" (concernant l'onglet ouvert).
 * La plupart des accès sites et pages sont dans les agents correspondants.
 */
function ncAgent_Memory(){
	this.currentUrl = "";
	this.memorizeCapsuleData = function(pageDocument, dmn, capsule){
		var url = ""+pageDocument.location;
		var pageObject = nc_pageMan.requirePage(url, dmn);
		var prof = nc_pageMan.getProf(url);
		// Cas : page d'accueil. Alors profondeur 0.
		if(url==dmn || url==dmn+"/" || url==dmn+"/index.htm" || url==dmn+"/index.html" || url==dmn+"/index.php"){
			prof = 0;
			nc_pageMan.updateProf(pageObject, prof);
		}
		
		// Mémoriser les liens
		for(var i = 0; i<capsule.links.length; i++){
			if(nc_parser.getHostFromUrl(""+capsule.links[i])==pageObject.dmn){
				// Lien interne
				nc_pageMan.addLinkToPage(""+capsule.links[i], pageObject, prof+1);
			} else {
				// Lien externe
				// NB : les pages externes référencées sont considérées comme ayant une profondeur de 0.
				nc_pageMan.addLinkToPage(""+capsule.links[i], pageObject, 0);
			}
			
		}
		return pageObject;
	}
	this.setCurrentUrl = function(url){
		//alert("Set URL courante : "+url);
		this.currentUrl = ""+url;
	}
	this.getCurrentUrl = function(){
		return this.currentUrl;
	}
	this.getCurrentDomain = function(){
		return nc_parser.getHostFromUrl(this.currentUrl);
	}
	this.getCurrentLinks = function(){
		var result = new Array();
		var pageObject = nc_pageMan.get(this.currentUrl, this.getCurrentDomain());
		if(pageObject != nc_pageMan.dummyPage){
			result = pageObject.links;
		}
		return result;
	}
	this.getCurrent_visitCount = function(){
		var result = 0;
		var pageObject = nc_pageMan.get(this.currentUrl, this.getCurrentDomain());
		if(pageObject != nc_pageMan.dummyPage){
			result = pageObject.visitCount;
		}
		return result;
	}
	this.getCurrentFlag = function(){
		return nc_pageMan.get(this.currentUrl, this.getCurrentDomain()).flag;
	}
	this.getCurrentProf = function(){
		return nc_pageMan.getProf(this.currentUrl);
	}
	this.getCurrentSiteVisited = function(){
		return nc_siteMan.isVisited(this.getCurrentDomain());
	}
	this.visitPage = function(url){
		var pageObject = nc_pageMan.get(url, nc_parser.getHostFromUrl(url));
		pageObject.visitCount++;
	}
	this.switch_flagCurrentPage = function(){
		nc_pageMan.get(this.currentUrl, this.getCurrentDomain()).flag = !nc_pageMan.get(this.currentUrl, this.getCurrentDomain()).flag;
		nc_ui.update();
	}
	this.switch_stateCurrentSite = function(){
		var dmn = this.getCurrentDomain();
		if(nc_siteMan.isVisited(dmn)){
			nc_siteMan.setFrontier(dmn);
		} else if(nc_siteMan.isFrontier(dmn)){
			nc_siteMan.setVisited(dmn);
		}
		nc_ui.update();
	}
}
/**
 * Gestionnaire de pages : cet agent se charge de tout ce qui concerne la gestion mémoire
 * des pages. Il est principalement utilisé par l'agent mémoriel. Attention à ne pas
 * attaquer frontalement les pages en passant outre ! Car il gère notamment la liste
 * des pages.
 */
function ncAgent_PageManager(){
	this.mem = new Array();
	this.id_count = 1;
	this.importantPagesarray = new Array();
	this.dummyPage = new ncObject_Page("dummy", "DUMMY", 1000, -1);
	this.createNewPage = function(url, dmn, prof){
		var pageObject = this.get(""+url, dmn);
		if(pageObject==this.dummyPage){
			pageObject = new ncObject_Page(""+url, dmn, prof, this.id_count++);
			nc_gconnect.notifyNewPage(pageObject);
			if(this.mem[dmn]==null){
				// Si le site pour la page n'est pas enregistré dans la mémoire des pages, on le rajoute
				this.mem[dmn] = {"urls":[], "pages":[]};
			}
			this.mem[dmn].urls.push(""+url);
			this.mem[dmn].pages.push(pageObject);
			//alert("Page "+url+ " créée");
		} else {
			//alert("Créer page : existe déjà\n"+url);
		}
		return pageObject;
	}
	this.getPage = function(url){ // Deprecated
		return this.get(""+url, nc_parser.getHostFromUrl(url));
	}
	this.get = function(url, dmn){
		if(this.mem[dmn]!=null){
			var pindex = this.mem[dmn].urls.indexOf(""+url);
			if(pindex>=0){
				//alert("get ok"+"\n"+url);
				return this.mem[dmn].pages[pindex];
			} else {
				//alert("get pas de page \n"+url);
				return this.dummyPage;
			}
		} else {
			//alert("get pas de dmn");
			return this.dummyPage;
		}
	}
	this.getAllPages = function(){
		var result = [];
		for(var i=0; i<nc_siteMan.domainsArray.length; i++){
			var dmn = nc_siteMan.domainsArray[i]
			for (var j=0; j<this.mem[dmn].pages.length; j++){
				result.push(this.mem[dmn].pages[j]);
			}
		}
		return result;
	}
	// Cette fonction est utilisée lorsqu'une page est requise pour une url donnée.
	// Si la page n'existe pas, elle est créée automatiquement.
	this.requirePage = function(url, dmn){
		var pageObject = this.get(""+url, dmn);
		//alert("require "+url+"\n\t->"+pageObject.url);
		if(pageObject==this.dummyPage){
			pageObject = this.createNewPage(""+url, dmn, 1000);
		}
		return pageObject;
	}
	this.addLinkToPage = function(aLink, aPageObject, prof){
		if(aPageObject.links.indexOf(""+aLink)<0){
			aPageObject.links.push(""+aLink);
			this.pushProfToPage(""+aLink, aPageObject.dmn, prof);
		}
	}
	this.pushProfToPage = function(pageUrl, pageDmn, prof){
		var pageObject = this.requirePage(pageUrl, pageDmn);
		this.updateProf(pageObject, prof);
	}
	this.updateProf = function(aPageObject, prof){
		if(prof<aPageObject.prof){
			aPageObject.prof = prof;
			for(var i=0; i<aPageObject.links.length; i++){
				nc_pageMan.updateProf(this.get(aPageObject.links[i], aPageObject.dmn), prof+1);
			}
		}
	}
	this.getLinks = function(aPageObject){
		return aPageObject.links;
	}
	this.getLinks_host = function(aPageObject){
		var result = new Array();
		for( var i = 0; i < aPageObject.links.length ; i++){
			var link = ""+aPageObject.links[i];
			var link_host = nc_parser.getHostFromUrl(link);
			if(result.indexOf(link_host)<0){
				if(link_host != ""){
					result.push(link_host);				
				}
			}
		}
		return result;
	}
	this.getProf = function(url){
		return this.get(url, nc_parser.getHostFromUrl(url)).prof;
	}
	this.addAlias = function(url){
		var pageObject = this.get(url, nc_parser.getHostFromUrl(url));
		if(pageObject != this.dummyPage){
			//pageObject.// TODO : gestion des alias !!!
		}
	}
	this.getAliases = function(url){
		
	}
	this.getDescriptor= function(url){
		return this.get(url, nc_parser.getHostFromUrl(url)).descriptor;
	}
	this.setDescriptor= function(url, descriptor){
		this.get(url, nc_parser.getHostFromUrl(url)).descriptor = descriptor;
	}
}
/**
 * Gestionnaire de sites : cet agent se charge de tout ce qui concerne la gestion mémoire
 * des sites. Il est principalement utilisé par l'agent mémoriel. Attention à ne pas
 * attaquer frontalement les sites en passant outre ! Car il gère notamment la liste
 * des sites.
 */
function ncAgent_SiteManager(){
	// Les index des sites et des domaines doivent mapper : ils servent à
	// passer de l'un à l'autre.
	this.sitesArray     = new Array();
	this.domainsArray   = new Array();
	// Optimisation : pour accélérer l'interface, on stocke en plus, à part, le nombre de sites visités, voisins et frontières.
	this.visitedCount	= 0;
	this.frontierCount	= 0;
	this.voisinCount	= 0;
	// Site "vide" pour renvoyer un site lorsqu'aucun n'est trouvé
	this.dummySite = new ncObject_Site("dummy", "DUMMY");
	// Créer un nouveau site.
	this.createNewSite = function(dmn){
		var siteObject = new ncObject_Site("ncs"+(this.domainsArray.length+1), ""+dmn);
		this.domainsArray.push(""+dmn);
		this.sitesArray.push(siteObject);
		// Création de la page d'accueil en profondeur 0
		nc_pageMan.createNewPage(""+dmn, ""+dmn, 0);
		this.addPage(""+dmn, ""+dmn);
		this.voisinCount++;
		nc_gconnect.notifyNewSite(siteObject);
		return siteObject;
	}
	this.removeSite = function(dmn){
		var index = this.domainsArray.indexOf(""+dmn);
		if(index>=0){
			// Etat du site à décompter
			var s = this.getSite(dmn);
			if(s.voisin){
				this.voisinCount--;
			} else if(s.visited){
				this.visitedCount--;
			} else if(s.frontier){
				this.frontierCount--;
			}
			// Supresssion de l'objet dans la mémoire
			var newDomainArray = new Array();
			var newSitesArray = new Array();
			for(var i=0; i<this.domainsArray.length; i++){
				if(i!=index){
					newDomainArray.push(this.domainsArray[i]);
					newSitesArray.push(this.sitesArray[i]);
				}
			}
			this.domainsArray = newDomainArray;
			this.sitesArray = newSitesArray;
		}
	}
	this.sort = function(){
		// tri à bulles manuel pour garder la correspondance site <-> domain
		var l = this.sitesArray.length;
		var permut = true;
		while(permut){
			permut = false;
			for(var i=0;i<l-1;i++){
				var a = this.domainsArray[i];
				var b = this.domainsArray[i+1];
				if(a>b){
					this.domainsArray.splice(i,1,b);
					this.domainsArray.splice(i+1,1,a);
					a = this.sitesArray[i];
					b = this.sitesArray[i+1];
					this.sitesArray.splice(i,1,b);
					this.sitesArray.splice(i+1,1,a);
					permut = true;
				}
			}
		}
	}
	this.getSite = function(dmn){
		var index = this.domainsArray.indexOf(""+dmn);
		if(index>=0){
			return this.sitesArray[index];
		} else {
			return this.dummySite;
		}
	}
	this.getDescriptor = function(dmn){
		var site = this.getSite(dmn);
		return site.descriptor;
	}
	this.getSites = function(){
		return this.domainsArray;
	}
	this.isVisited = function(dmn){
		var siteObject = this.getSite(""+dmn);
		this.check_v_v_f(siteObject);
		if(siteObject==this.dummySite){
			return false;
		} else {
			return siteObject.visited;
		}
	}
	this.isVoisin = function(dmn){
		var siteObject = this.getSite(""+dmn);
		this.check_v_v_f(siteObject);
		if(siteObject==this.dummySite){
			return false;
		} else {
			return siteObject.voisin;
		}
	}
	this.isFrontier = function(dmn){
		var siteObject = this.getSite(""+dmn);
		this.check_v_v_f(siteObject);
		if(siteObject==this.dummySite){
			return false;
		} else {
			return siteObject.frontier;
		}
	}
	this.setVisited = function(dmn){
		var siteObject = this.getSite(""+dmn);
		// Etat du site à décompter
		if(siteObject.voisin){
			this.voisinCount--;
		} else if(siteObject.visited){
			this.visitedCount--;
		} else if(siteObject.frontier){
			this.frontierCount--;
		}
		// Affectation
		siteObject.visited	= true;
		siteObject.voisin	= false;
		siteObject.frontier	= false;
		// Incrémenter le compte en mémoire (pour optimisation ui)
		this.visitedCount++;
	}
	this.setVoisin = function(dmn){
		var siteObject = this.getSite(""+dmn);
		// Etat du site à décompter
		if(siteObject.voisin){
			this.voisinCount--;
		} else if(siteObject.visited){
			this.visitedCount--;
		} else if(siteObject.frontier){
			this.frontierCount--;
		}
		// Affectation
		siteObject.visited	= false;
		siteObject.voisin	= true;
		siteObject.frontier	= false;
		// Incrémenter le compte en mémoire (pour optimisation ui)
		this.voisinCount++;
	}
	this.setFrontier = function(dmn){
		var siteObject = this.getSite(""+dmn);
		// Etat du site à décompter
		if(siteObject.voisin){
			this.voisinCount--;
		} else if(siteObject.visited){
			this.visitedCount--;
		} else if(siteObject.frontier){
			this.frontierCount--;
		}
		// Affectation
		siteObject.visited	= false;
		siteObject.voisin	= false;
		siteObject.frontier	= true;
		// Incrémenter le compte en mémoire (pour optimisation ui)
		this.frontierCount++;
		// Attention : lorsqu'un site est marqué comme frontière, il a été techniquement
		// visité. Pour cette raison, il faut regarder ses voisins (les sites cités non-visités) :
		// A chaque fois qu'un voisin n'est référencé par aucun site visité, il faut le supprimer.
		for(var i=0; i<this.getLinksTo(dmn).length; i++){
			var siteCite = this.getLinksTo(dmn)[i];
			if(nc_siteMan.isVoisin(siteCite)){
				var erase = true;
				for(var j=0; j<this.getLinksFrom(siteCite).length; j++){
					var refereur_a_evaluer = this.getLinksFrom(siteCite)[j];
					if(this.isVisited(refereur_a_evaluer)){
						erase = false;
						j = 100000;
					}
				}
				if(erase){
					this.removeSite(siteCite);
				}
			}
		}
	}
	this.getVisitedList= function(){
		var result = new Array();
		for(var i=0; i<this.domainsArray.length; i++){
			if(this.isVisited(this.domainsArray[i])){
				result.push(this.domainsArray[i]);
			}
		}
		return result;
	}
	this.getVisitedCount = function(){
		return this.visitedCount;
	}
	this.getVoisinList = function(){
		var result = new Array();
		for(var i=0; i<this.domainsArray.length; i++){
			if(this.isVoisin(this.domainsArray[i])){
				result.push(this.domainsArray[i]);
			}
		}
		return result;
	}
	this.getVoisinCount = function(){
		return this.voisinCount;
	}
	this.getFrontierList = function(){
		var result = new Array();
		for(var i=0; i<this.domainsArray.length; i++){
			if(this.isFrontier(this.domainsArray[i])){
				result.push(this.domainsArray[i]);
			}
		}
		return result;
	}
	this.getFrontierCount = function(){
		return this.frontierCount;
	}
	// Tester si le site est OU visité OU voisin OU frontière. Sinon, le mettre "voisin".
	this.check_v_v_f = function(siteObject){
		if(siteObject.visited && !siteObject.voisin && !siteObject.frontier){
			// visité
		} else {
			if(!siteObject.visited && siteObject.voisin && !siteObject.frontier){
				// voisin
			} else {
				if(!siteObject.visited && !siteObject.voisin && siteObject.frontier){
					// frontière
				} else {
					// Erreur : on remet à "voisin".
					siteObject.visited	= false;
					siteObject.voisin	= true;
					siteObject.frontier	= false;
				}
			}
		}
	}
	this.addPage = function(dmn, url){
		var siteObject = nc_siteMan.getSite(""+dmn);
		if(siteObject.pages.indexOf(""+url)==-1){
			siteObject.pages.push(""+url);
		}
	}
	this.addLink = function(dmnFrom, dmnTo){
		if(dmnFrom!="" && dmnTo!=""){
			var siteObjectFrom = nc_siteMan.getSite(""+dmnFrom);
			if(siteObjectFrom.linksTo.indexOf(""+dmnTo)<0){
				siteObjectFrom.linksTo.push(""+dmnTo);
			}
			var siteObjectTo = nc_siteMan.getSite(""+dmnTo);
			if(siteObjectTo.linksFrom.indexOf(""+dmnFrom)<0){
				siteObjectTo.linksFrom.push(""+dmnFrom);
			}
		}
	}
	this.addLinks = function(dmn, siteLinks){
		for(var i=0; i<siteLinks.length; i++){
			if(dmn != siteLinks[i]){
				this.addLink(dmn, siteLinks[i]);
			}
		}
		this.refreshDist(dmn);
		nc_gconnect.notifyNewSite(nc_siteMan.getSite(""+dmn));
	}
	// Obtenir les sites par lesquels le site est cité (voisins à l'origine des liens entrants, ou référeurs)
	this.getLinksFrom = function(dmn){
		return this.getSite(dmn).linksFrom;
	}
	// Obtenir les sites cités par le site (voisins au bout des liens sortants)
	this.getLinksTo = function(dmn){
		return this.getSite(dmn).linksTo;
	}
	// Obtenir les pages du site
	this.getPages = function(dmn){
		return this.getSite(dmn).pages;
	}
	// Obtenir les pages qui ont un été marquées dans le site
	this.getPages_flag = function(dmn){
		var result = new Array();
		var pagesArray = this.getPages(dmn);
		for(var i=0; i<pagesArray.length; i++){
			if(nc_pageMan.get(pagesArray[i], dmn).flag){
				result.push(pagesArray[i]);
			}
		}
		return result;
	}
	this.setDist = function(dmn, dist){
		this.updateDist(this.getSite(""+dmn), dist);
	}
	this.updateDist = function(siteObject, dist){
		if(dist<siteObject.dist){
			siteObject.dist = dist;
			for(var i=0; i<siteObject.linksFrom.length; i++){
				nc_siteMan.updateDist(this.getSite(""+siteObject.linksFrom[i]), dist+1);
			}
			for(var i=0; i<siteObject.linksTo.length; i++){
				nc_siteMan.updateDist(this.getSite(""+siteObject.linksTo[i]), dist+1);
			}
		}
	}
	this.refreshDist = function(dmn){
		var siteObject = this.getSite(""+dmn)
		var dist = siteObject.dist;
		for(var i=0; i<siteObject.linksFrom.length; i++){
			nc_siteMan.updateDist(this.getSite(""+siteObject.linksFrom[i]), dist+1);
		}
		for(var i=0; i<siteObject.linksTo.length; i++){
			nc_siteMan.updateDist(this.getSite(""+siteObject.linksTo[i]), dist+1);
		}
		/*var msg = "REFRESH :: Sites :"
		for(var s=0; s<this.sitesArray.length; s++){
			msg+="\n"+this.sitesArray[s].dist+"\t"+this.sitesArray[s].label;
		}
		alert(msg);*/
	}
	this.getDist = function(dmn){
		return this.getSite(dmn).dist;
	}
	this.resetAllDist = function(){
		for(var i=0; i<this.sitesArray.length; i++){
			this.sitesArray[i].dist = 1000;
		}
	}
}
/**
 * Cet agent est chargé de traiter toutes les données filtrées par les heuristiques.
 */
function ncAgent_Heuristiques(){
	// Scrapped data structure
	this.data = {
		entTypes:[],
		entTypesEntities:[],
		entProperties:[],
		currentEntities:[],
		sites:[],
		siteProperties:[],
		currentSiteProperties:[],
		linkTypes:[]
	};
	this.crawlActive = false;
	this.crawlables = [];
	this.crawlablesURLs = [];
	this.crawlablesDepths = [];
	this.crawlablesLinksTo = [];
	this.entityCount = 0;
	// Doc
	this.XMLdoc = window.top.document.implementation.createDocument("","", null);
	this.isLoaded = false;
	// Chargement du fichier XML des heuristiques
	this.LoadXML = function(path){
		nc_heuristiques.XMLdoc.load(path);
		nc_heuristiques.XMLdoc.onload = nc_heuristiques.SetLoad();
	}
	this.SetLoad = function(){
		this.isLoaded = true;
	}
	// Crawl
	this.setCrawlActive = function(){
		this.crawlables = [];
		this.crawlablesURLs = [];
		this.crawlablesDepths = [];
		this.crawlActive = true;
	}
	this.setCrawlInactive = function(){
		this.crawlables = [];
		this.crawlablesURLs = [];
		this.crawlablesDepths = [];
		this.crawlActive = false;
	}
	this.getCrawlableDepth = function(url){
		var index = this.crawlables.indexOf(url);
		if (index >= 0) {
			return this.crawlablesDepths[index];
		} else {
			return 1000;
		}
	}
	this.notifyCrawlable = function(name, depth){
		var index = this.crawlables.indexOf(name);
		if(index<0){
			this.crawlables.push(name);
			this.crawlablesURLs.push(name);
			this.crawlablesDepths.push(depth);
			this.crawlablesLinksTo.push([]);
			nc_autonav.notifyCrawlable(this.crawlables.indexOf(name));
		} else {
			this.notifyCrawlableDepth(index, depth);
		}
	}
	this.notifyCrawlableLink = function(from, to){
		var fi = this.crawlables.indexOf(from);
		if (fi >= 0) {
			var depth = this.crawlablesDepths[fi];
			var links = this.crawlablesLinksTo[fi];
			if(links.indexOf(to)<0){
				links.push(to);
				this.crawlablesLinksTo[fi] = links;
			}
			this.notifyCrawlable(to, depth+1);
		} else {
			//alert("Scrap crawl error :\nLien depuis un crawlable inconnu : "+from);
		}
	}
	this.notifyCrawlableDepth = function(index, depth){
		var old_d = this.crawlablesDepths[index];
		if (depth < old_d) {
			this.crawlablesDepths[index] = depth;
			for each(crawlable in this.crawlablesLinksTo[index]){
				var ci = this.crawlables.indexOf(crawlable);
				if(ci>=0){
					nc_heuristiques.notifyCrawlableDepth(ci, depth+1);
				} else {
					alert("Erreur de scrap crawl\n" + crawlable + " lié mais non enregistré ");
				}
			}
			nc_autonav.notifyCrawlable(index);
		}
	}
	this.setCrawlableUrl = function(crawlable, url){
		var index = this.crawlables.indexOf(crawlable);
		if(index>=0){
			this.crawlablesURLs[index] = url;
			nc_autonav.notifyCrawlable(index);
		}
	}
	// Active filters
	this.getFiltersList = function(){
		var filtersArray = new Array;
		if (this.isLoaded) {
			// Access to filters xml with xpath
			var nsResolver = nc_heuristiques.XMLdoc.createNSResolver(nc_heuristiques.XMLdoc.ownerDocument == null ? nc_heuristiques.XMLdoc.documentElement : nc_heuristiques.XMLdoc.ownerDocument.documentElement);
			var filtersIterator = nc_heuristiques.XMLdoc.evaluate('//filter', nc_heuristiques.XMLdoc, nsResolver, XPathResult.ANY_TYPE, null);
			var f; // xpath filter result
			while (f = filtersIterator.iterateNext()) {
				var check;
				// Check and get filter label
				var filter_label = "no filter name";
				check = this.evalXPath(f, "@label");
				if (check.length == 1) 
					filter_label = check[0].value;
				filtersArray.push(filter_label);
			}
		}
		return filtersArray;
	}
	this.whichFiltersActive = function(filters){
		var activeFiltersString = nc_pref.getString("filters");
		var activeFilters = activeFiltersString.split("_BROLY_SEPARATOR_");
		var result = [];
		for each (flabel in filters){
			if(flabel != "")
				result.push(activeFilters.indexOf(flabel)>=0);
		}
		return result;
	}
	this.setFilterActive = function(filterlabel){
		var activeFiltersString = nc_pref.getString("filters");
		var activeFilters = activeFiltersString.split("_BROLY_SEPARATOR_");
		activeFilters.push(filterlabel);
		activeFiltersString = "";
		var filters = this.getFiltersList();
		for each (flabel in activeFilters){
			if(filters.indexOf(flabel)>=0)
				activeFiltersString += flabel + "_BROLY_SEPARATOR_";
		}
		nc_pref.setString("filters", activeFiltersString);
		nc_ui.update();
	}
	this.setFilterInactive = function(filterlabel){
		var activeFiltersString = nc_pref.getString("filters");
		var activeFilters = activeFiltersString.split("_BROLY_SEPARATOR_");
		activeFiltersString = "";
		var filters = this.getFiltersList();
		for each (flabel in activeFilters){
			if(filters.indexOf(flabel)>=0 && flabel != filterlabel)
				activeFiltersString += flabel + "_BROLY_SEPARATOR_";
		}
		nc_pref.setString("filters", activeFiltersString);
		nc_ui.update();
	}
	// Store data
	this.notifyType = function(type){
		var index = this.data.entTypes.indexOf(type);
		if(index<0){
			index = this.data.entTypes.length;
			this.data.entTypes.push(type);
			this.data.entTypesEntities.push([]);
		}
		return index;
	}
	this.notifyIndependantEntity = function(entity, type){
		var typeIndex = this.notifyType(type);
		var entities = this.data.entTypesEntities[typeIndex];
		var exists = false;
		for each (e in entities){
			if(e.name == entity){
				exists = true;
				break;
			}
		}
		var e = {name:entity, id:this.entityCount++, properties:[{name:"type", value:type}], linksTo:{site:[], entity:[]}};
		if(!exists){
			entities.push(e);
		}
		// add to current entities
		this.data.currentEntities.push(e);
	}
	this.setEntityProperty = function(property, value, entityType, entity){
		this.notifyEntityProperty(property);
		var tindex = this.data.entTypes.indexOf(entityType);
		var entities = this.data.entTypesEntities[tindex];
		var eexists = false;
		for each (e in entities){
			if(e.name == entity){
				eexists = true;
				var pexists = false;
				for each (p in e.properties){
					if(p.name == property){
						pexists = true;
						p.value = value;
						break;
					}
				}
				if(!pexists){
					var p = {name:property, value:value};
					e.properties.push(p);
				}
				break;
			}
		}
		if(!eexists){
			dump("Scrap - Missing entity : "+entity+" (for property "+property+")");
		}
	}
	this.notifyEntityProperty = function(property){
		var index = this.data.entProperties.indexOf(property);
		if(index<0){
			this.data.entProperties.push(property);
		}
	}
	this.getCurrentEntity = function(entityType){
		for each (e in this.data.currentEntities){
			for each (p in e.properties){
				if(p.name == "type" && p.value==entityType)
					return e.name;
			}
		}
		return null;
	}
	this.setSiteProperty = function(dmn, property, value){
		this.notifySiteProperty(property);
		var sexists = false;
		for each (s in this.data.sites){
			if(s.domain == dmn){
				sexists = true;
				var pexists = false;
				for each (p in s.properties){
					if(s.domain == property){
						pexists = true;
						p.value = value;
						break;
					}
				}
				if(!pexists){
					var p = {name:property, value:value};
					s.properties.push(p);
				}
				break;
			}
		}
		if(!sexists){
			var s = {domain:dmn, properties:[{name:property, value:value}], linksTo:{site:[], entity:[]}};
			this.data.sites.push(s);
		}
		this.data.currentSiteProperties.push({site:dmn, name:property, value:value});
	}
	this.notifySiteProperty = function(property){
		var index = this.data.siteProperties.indexOf(property);
		if(index<0){
			this.data.siteProperties.push(property);
		}
	}
	this.notifyLinkType = function(type){
		if(this.data.linkTypes.indexOf(type)<0)
			this.data.linkTypes.push(type);
	}
	this.linkEntityToEntity = function(relation, sourceType, sourceId, targetType, targetId){
		this.notifyLinkType(relation);
		this.notifyIndependantEntity(targetId, targetType);
		this.notifyIndependantEntity(sourceId, sourceType);
		var tindex = this.data.entTypes.indexOf(sourceType);
		var entities = this.data.entTypesEntities[tindex];
		for each (e in entities){
			if(e.name == sourceId){
				var lexists = false;
				for each (target in e.linksTo.entity){
					if(target.relation == relation && target.entity == targetId){
						lexists = true;
						break;
					}
				}
				if(!lexists){
					var entityLink = {relation:relation, entity:targetId, type:targetType};
					e.linksTo.entity.push(entityLink);
				}
				break;
			}
		}
	}
	this.linkEntityToSite = function(relation, sourceType, sourceId, targetDmn){
		this.notifyLinkType(relation);
		this.notifyIndependantEntity(sourceId, sourceType);
		var tindex = this.data.entTypes.indexOf(sourceType);
		var entities = this.data.entTypesEntities[tindex];
		for each (e in entities){
			if(e.name == sourceId){
				var lexists = false;
				for each (target in e.linksTo.site){
					if(target.relation == relation && target.dmn == targetDmn){
						lexists = true;
						break;
					}
				}
				if(!lexists){
					var siteLink = {relation:relation, dmn:targetDmn};
					e.linksTo.site.push(siteLink);
				}
				break;
			}
		}
	}
	this.linkSiteToEntity = function(relation, sourceDmn, targetType, targetId){
		this.notifyLinkType(relation);
		this.notifyIndependantEntity(targetId, targetType);
		for each (s in this.data.sites){
			if(s.domain == sourceDmn){
				var lexists = false;
				for each (target in s.linksTo.entity){
					if(target.relation == relation && target.entity == targetId){
						lexists = true;
						break;
					}
				}
				if(!lexists){
					var entityLink = {relation:relation, entity:targetId, type:targetType};
					s.linksTo.entity.push(entityLink);
				}
				break;
			}
		}
	}
	this.linkSiteToSite = function(relation, sourceDmn, targetDmn){
		this.notifyLinkType(relation);
		for each (s in this.data.sites){
			if(s.domain == sourceDmn){
				var lexists = false;
				for each (target in s.linksTo.site){
					if(target.relation == relation && target.dmn == targetDmn){
						lexists = true;
						break;
					}
				}
				if(!lexists){
					var siteLink = {relation:relation, dmn:targetDmn};
					s.linksTo.site.push(siteLink);
				}
				break;
			}
		}
	}
	// Retourne l'ensemble des filtres applicables au dmn passé en argument sous forme d'un tableau d'objets filter
	this.getFilters = function(url){
		var filtersArray = new Array;
		if(this.isLoaded){
			// Get active filters list
			var activeFiltersString = nc_pref.getString("filters");
			var activeFilters = activeFiltersString.split("_BROLY_SEPARATOR_");
			// Access to filters xml with xpath
			var nsResolver = nc_heuristiques.XMLdoc.createNSResolver( nc_heuristiques.XMLdoc.ownerDocument == null ? nc_heuristiques.XMLdoc.documentElement : nc_heuristiques.XMLdoc.ownerDocument.documentElement);
			var filtersIterator = nc_heuristiques.XMLdoc.evaluate('//filter', nc_heuristiques.XMLdoc, nsResolver, XPathResult.ANY_TYPE, null );
			var f;	// xpath filter result
			while (f = filtersIterator.iterateNext()) {
				var check;
				// Check and get filter label
				var filter_label = "no filter name";
				check = this.evalXPath(f, "@label");
				if (check.length == 1) 
					filter_label = check[0].value;
				if (activeFilters.indexOf(filter_label) >= 0) {
					// Check and get domain template
					check = this.evalXPath(f, "domain_template");
					if (check.length == 1) {
						var template = check[0].textContent;
						var model = new RegExp(template, "i");
						var condition = model.test(url);
						//alert(condition+"\n"+template+"\n"+url);
						if (condition) {
							// Parse filter !!
							// Get element definers
							var definersIterator = nc_heuristiques.XMLdoc.evaluate('define_element', f, nsResolver, XPathResult.ANY_TYPE, null);
							var ed; // xpath element definer result
							while (ed = definersIterator.iterateNext()) {
								// Check and get element label
								var element_label = "no element name";
								check = this.evalXPath(ed, "@label");
								if (check.length == 1) {
									element_label = check[0].value;
								}
								// Check and get element type
								var element_type = "node";
								check = this.evalXPath(ed, "@type");
								if (check.length == 1) {
									element_type = check[0].value;
								}
								// Check and get target_node_template
								check = this.evalXPath(ed, "target_node_template");
								if (check.length == 1) {
									var target_node_template = check[0].textContent;
									// Check and get grab
									check = this.evalXPath(ed, "grab");
									if (check.length == 1) {
										var grab = check[0].textContent;
										// Check and get element site
										var element_site = "";
										check = this.evalXPath(ed, "site");
										if (check.length == 1) {
											element_site = check[0].textContent;
										}
										// Check and get element entityType
										var element_entityType = "";
										check = this.evalXPath(ed, "entityType");
										if (check.length == 1) {
											element_entityType = check[0].textContent;
										}
										// Check and get element entity
										var element_entity = "";
										check = this.evalXPath(ed, "entity");
										if (check.length == 1) {
											element_entity = check[0].textContent;
										}
										// Check and get element sourceType
										var element_sourceType = "";
										check = this.evalXPath(ed, "sourceType");
										if (check.length == 1) {
											element_sourceType = check[0].textContent;
										}
										// Check and get element source
										var element_source = "";
										check = this.evalXPath(ed, "source");
										if (check.length == 1) {
											element_source = check[0].textContent;
										}
										// Check and get element targetType
										var element_targetType = "";
										check = this.evalXPath(ed, "targetType");
										if (check.length == 1) {
											element_targetType = check[0].textContent;
										}
										// Create scrapElementDefiner object
										var sedObject = new nc_Object_ScrapElementDefiner(filter_label, element_type, element_label, target_node_template, grab, element_site, element_entityType, element_entity, element_sourceType, element_source, element_targetType);
										sedObject.init();
										filtersArray.push(sedObject);
									}
									else {
										alert("/!\\ Filter parsing error :\nthere should be one grab node in filter \"" + filter_label + "\", element \"" + element_label + "\"");
									}
								}
								else {
									alert("/!\\ Filter parsing error :\nthere should be one target_node_template node in filter \"" + filter_label + "\", element \"" + element_label + "\"");
								}
							}
						}
					}
					else {
						alert("/!\\ Filter parsing error :\nthere should be one domain_template node in filter \"" + filter_label + "\"");
					}
				}
			}
			return filtersArray;
		} else {
			alert("XML des filtres non chargé")
		}
		return new Array();
	}
	this.evalXPath = function(aNode, aExpr){
		// Evaluate an XPath expression aExpression against a given DOM node
		// or Document object (aNode), returning the results as an array
		// thanks wanderingstan at morethanwarm dot mail dot com for the
		// initial work.
		var xpe = new XPathEvaluator();
		var nsResolver = xpe.createNSResolver(aNode.ownerDocument == null ? aNode.documentElement : aNode.ownerDocument.documentElement);
		var result = xpe.evaluate(aExpr, aNode, nsResolver, 0, null);
		var found = [];
		var res;
		while (res = result.iterateNext())
			found.push(res);
		return found;
	}
}
/**
 * Cet agent contient des fonctions utilitaires
 */
function ncAgent_Utilitaires(){
	this.removeVoisinsFeuilles = function(){
		var voisins = nc_siteMan.getVoisinList();
		var toRemove = new Array();
		for(i=0; i<voisins.length; i++){
			var site = nc_siteMan.getSite(voisins[i]);
			if(site.linksFrom.length<2){
				toRemove.push(site.label);
			}
		}
		var count = toRemove.length;
		for(i=0; i<toRemove.length; i++){
			nc_siteMan.removeSite(toRemove[i]);
		}
		alert(nc_locale.GetStringFromName("oneInLinkDelete")+"\n("+count+")")
		nc_ui.update();
	}
	this.openEachVisite = function(){
		var visites = nc_siteMan.getVisitedList();
		for(i=0; i<visites.length; i++){
			nc_parasit.goToURL(visites[i],"tab");
		}
	}
}
///// Objets //////////////////////////////////////////////////////////////////////////
/**
 * Page en parsage : cet objet fonctionne comme une capsule.
 * Il permet de regrouper au même endroit la page, les frames
 * qu'elle contient, les liens et de manière générale toutes
 * les infos que l'on veut récupérer. C'est un objet jetable,
 * qui est détruit à la fin du parsage. Seules les données
 * importantes sont conservées et stockées dans l'objet "page".
 */
function ncObject_PageParsingCapsule(pageDocument, dmn){
	this.pageDocument	= pageDocument;
	this.dmn			= dmn;
	this.frames			= new Array();
	this.framesFiltered	= new Array();
	this.links			= new Array();
	this.BlogLinks		= "";
	this.text			= "";
	this.addFrame = function(theFrame){
		if(this.frames.indexOf(theFrame)<0){
			this.frames[this.frames.length] = theFrame;
		}
	}
	this.addLinks = function(linksArray){
		for(i=0; i<linksArray.length; i++){
			if(this.links.indexOf(linksArray[i])<0){
				this.links[this.links.length] = linksArray[i];
			}
		}
	}
	this.isTotallyFiltered = function(){
		for(i=0; i<this.frames.length; i++){
			if(this.framesFiltered.indexOf(this.frames[i])<0){
				return false;
			}
		}
		return true;
	}
	this.frameIsFiltered = function(theFrame){
		if(this.frames.indexOf(theFrame)>=0 && this.framesFiltered.indexOf(theFrame)<0){
			this.framesFiltered[this.framesFiltered.length] = theFrame;
		}
		if(this.isTotallyFiltered()){
			nc_ddp.transformCapsuleToPage(this, this.dmn);
		}
	}
}
/**
 * Objet page : cet objet contient les données qui représentent une page
 * pour le logiciel.
 */
// Page Object
function ncObject_Page(url, dmn, prof, id){
	this.id				= id;
	this.url			= url;
	this.dmn			= dmn;
	this.prof			= prof;
	this.principal		= false;		// boolean ; idem
	this.visitCount		= 0;
	this.flag			= false;
	this.links			= new Array();
	this.redirection	= new Array();	// idem : gérer le cas des redirections ; à faire.
}

/**
 * Objet site : cet objet contient les données qui représentent un site
 * pour le logiciel.
 */
function ncObject_Site(id, label){
	this.id				= id;
	this.label			= label;
	this.pages			= new Array();
	this.linksFrom		= new Array();
	this.linksTo		= new Array();
	this.visited		= false;
	this.voisin			= true;
	this.frontier		= false;
	this.dist			= 1000;
}
/**
 * Objet Scrap Element Definer : cet objet définit comment scrapper un élément dans la page
 * et ce qu'on doit en faire ensuite. (Heuristiques)
 * Au moment du parsage, cet élément sera intégré aux données heuristiques comme élément.
 */
function nc_Object_ScrapElementDefiner(sourceFilter, type, label, condition, grab, site, entityType, entity, sourceType, source, targetType){
	this.sourceFilter		= sourceFilter;
	this.type				= type;
	this.label				= label;
	this.condition			= condition;
	this.grab				= grab;
	this.site				= site;
	this.entityType			= entityType;
	this.entity				= entity;
	this.sourceType			= sourceType;
	this.source				= source;
	this.targetType			= targetType;
	this.run = function(iterator, pageCapsule, elementDefiner){
		//alert("Scrap Element Definer : \nsourceFilter = "+this.sourceFilter);
		var cleanerExpr = new RegExp("[\n]","gi");
		while(iterator.nextNode()){
			var grabbeds;
			try{
				var theNode = iterator.currentNode;
				grabbeds = eval(elementDefiner.grab).replace(cleanerExpr," ");
				var grabbedArray = grabbeds.split("_BROLYSPLIT_");
				for each(grabbed in grabbedArray){
					if(grabbed != ""){
						// Different cases of type
						if(elementDefiner.type=="siteUniqueProperty"){
							
							// SITE unique PROPERTY
							var site = elementDefiner.site;
							if (site == "") {
								site = pageCapsule.dmn;
							} else {
								site = eval(elementDefiner.site).replace(cleanerExpr," ");
							}
							nc_heuristiques.setSiteProperty(site, elementDefiner.label, grabbed);
							if(nc_heuristiques.crawlActive && nc_heuristiques.getCrawlableDepth(""+pageCapsule.pageDocument.location)==0){
								//alert("site source : "+grabbed);
								nc_heuristiques.notifyCrawlable(site,0);
							}
							
						} else if(elementDefiner.type=="entityUniqueProperty"){
							
							// ENTITY unique PROPERTY
							var entity = elementDefiner.entity;
							if (entity == "") {
								entity = nc_heuristiques.getCurrentEntity(elementDefiner.entityType);
							} else {
								entity = eval(elementDefiner.entity);
							}
							nc_heuristiques.setEntityProperty(elementDefiner.label, grabbed, elementDefiner.entityType, entity);
							// crawlable : only if it's an URL
							if(nc_heuristiques.crawlActive && grabbed.indexOf("http")==0){
								//alert("entité devient crawlable : "+entity+" url="+grabbed);
								nc_heuristiques.setCrawlableUrl(entity,grabbed);
							}
							
						} else if(elementDefiner.type=="independantEntity"){
							
							// ENTITY
							nc_heuristiques.notifyIndependantEntity(grabbed,elementDefiner.label);
							// crawlable : only if on start page (else it's already known by link)
							if(nc_heuristiques.crawlActive && nc_heuristiques.getCrawlableDepth(""+pageCapsule.pageDocument.location)==0){
								//alert("entité source : "+grabbed);
								nc_heuristiques.notifyCrawlable(grabbed,0);
							}
							
						} else if(elementDefiner.type=="siteToSiteLink"){
							
							// LINK SITE -> SITE
							nc_heuristiques.linkSiteToSite(elementDefiner.label, pageCapsule.dmn, grabbed);
							// crawlable : always (we'll look elsewhere for the depth)
							if(nc_heuristiques.crawlActive){
								nc_heuristiques.notifyCrawlableLink(pageCapsule.dmn,grabbed);
							}
							
						} else if(elementDefiner.type=="siteToEntityLink"){
							
							// LINK SITE -> ENTITY
							nc_heuristiques.linkSiteToEntity(elementDefiner.label, pageCapsule.dmn, elementDefiner.entityType, grabbed);
							if(nc_heuristiques.crawlActive){
								nc_heuristiques.notifyCrawlableLink(pageCapsule.dmn,grabbed);
							}
							
						} else if(elementDefiner.type=="entityToSiteLink"){
							
							// LINK ENTITY -> SITE
							var site = elementDefiner.site;
							if (site == "") {
								site = pageCapsule.dmn;
							} else {
								site = eval(elementDefiner.site).replace(cleanerExpr," ");
							}
							nc_heuristiques.linkEntityToSite(elementDefiner.label, elementDefiner.entityType, grabbed, site);
							if(nc_heuristiques.crawlActive){
								nc_heuristiques.notifyCrawlableLink(grabbed,site);
							}
							
						} else if(elementDefiner.type=="entityToEntityLink"){
							
							// LINK ENTITY -> ENTITY
							var source = elementDefiner.source;
							if(elementDefiner.source==""){
								source = nc_heuristiques.getCurrentEntity(elementDefiner.sourceType);
							} else {
								source = eval(elementDefiner.source);
							}
							nc_heuristiques.linkEntityToEntity(elementDefiner.label, elementDefiner.sourceType, source, elementDefiner.targetType, grabbed);
							// crawlable : always (we'll look elsewhere for the depth)
							if(nc_heuristiques.crawlActive){
								nc_heuristiques.notifyCrawlableLink(source,grabbed);
							}
							
						} else if(elementDefiner.type=="node"){
							
							// NODE
							var site = elementDefiner.site;
							if (site == "") {
								site = pageCapsule.dmn;
							} else {
								site = eval(elementDefiner.site).replace(cleanerExpr," ");
							}
							nc_heuristiques.notifyIndependantEntity(grabbed,elementDefiner.label);
							nc_heuristiques.linkEntityToSite("ScrappedFor", elementDefiner.label, grabbed, site);
							
						} else if(elementDefiner.type=="crawlPath"){
							
							// CRAWLPATH
							// crawlable : always
							if(nc_heuristiques.crawlActive){
								if(nc_parser.getHostFromUrl(grabbed)==pageCapsule.dmn)	// Depth protection
									nc_heuristiques.notifyCrawlable(grabbed, nc_heuristiques.getCrawlableDepth(""+pageCapsule.dmn));
							}
						}
					}
				}
			} catch(e) {
				dump("Grab error : "+e);
			}
		}
	}
	this.select = function(theNode, condition){
		try{
			if(eval(condition)){
				return NodeFilter.FILTER_ACCEPT;
			} else {
				return NodeFilter.FILTER_SKIP;
			}
		} catch(e) {
			return NodeFilter.FILTER_SKIP;
		}
	};
	this.init	= function(){
		//this.select = this.select.replace("WEBATLAS_CONDITION", this.condition, "g");
	}
}
////// DEBUG
var log = "LOG :";
function plog(msg){
	temps = new Date();
	log += "\n["+temps.getMinutes()+":\t"+temps.getSeconds()+"."+temps.getMilliseconds()+"]   \t"+msg;
}
function shlog(){
	plog("/AFFICHAGE");
	alert(log);
	log = "";
}