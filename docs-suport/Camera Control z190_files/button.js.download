// JavaScript Document
//this.ImageItemsEvent mouseup/mousedown/mouseover/mouseout/disabled
//this.ImageItems rest/pressed/hover/out/disabled
function ButtonCtrl(objSrc, arrImageItems, objCallback)
{
	this.Parent = GetParent(objSrc);
	this.AttachSrc = objSrc;
	this.Width = parseInt(objSrc.style.width);
	this.CallbackFunc = objCallback;
	this.RootURL = GetRootPath();
	this.Type = "BUTTON";
	this.ImageItems = arrImageItems;
	
	var m_objSelf = null;
	
	this.Initialize = function()
	{
		if (!m_objSelf)
		{
			m_objSelf = this;
			AddEvent(this.AttachSrc, "click", this.CallbackBtnClick);
			AddEvent(this.AttachSrc, "mouseout", this.CallbackBtnMouseOut);
			AddEvent(this.AttachSrc, "mousedown", this.CallbackBtnMouseDown);
			AddEvent(this.AttachSrc, "mouseup", this.CallbackBtnMouseUp);	
			AddEvent(this.AttachSrc, "touchstart", this.CallbackBtnTouchStart);	
			AddEvent(this.AttachSrc, "touchend", this.CallbackBtnTouchEnd);		
			AddEvent(this.AttachSrc, "touchcancel", this.CallbackBtnTouchCancel);	
		}
	};

	
	this.CallbackBtnMouseOver = function(objEvent)
	{
		var objSrc = GetEventSource(objEvent);
		
		if ("" == objSrc.id)
		{
			objSrc = GetParent(objSrc);
		}
		
		objSrc.style.backgroundImage = "URL(WebCommon/images/" + arrImageItems[2] +".png)";
	};
	
	this.CallbackBtnMouseOut = function(objEvent)
	{

		var objSrc = GetEventSource(objEvent);
		
		if ("" == objSrc.id)
		{
			objSrc = GetParent(objSrc);
		}
		
		objSrc.style.color = "#333333";
		objSrc.style.backgroundImage  = "URL(WebCommon/images/" + arrImageItems[0] +".png)";
	};
	
	this.CallbackBtnMouseDown = function(objEvent)
	{
		var objSrc = GetEventSource(objEvent);
		
		if ("" == objSrc.id)
		{
			objSrc = GetParent(objSrc);
		}
		objSrc.style.color = "#000";
		objSrc.style.backgroundImage = "URL(WebCommon/images/" + arrImageItems[1] +".png)";
	};
	
	this.CallbackBtnMouseUp = function(objEvent)
	{
		var objSrc = GetEventSource(objEvent);
		
		if ("" == objSrc.id)
		{
			objSrc = GetParent(objSrc);
		}
		objSrc.style.color = "#333333";
		objSrc.style.backgroundImage  = "URL(WebCommon/images/" + arrImageItems[0] +".png)";
	};
	
	this.CallbackBtnClick = function(objEvent)
	{
		var objSrc = GetEventSource(objEvent);
		
		if ("" == objSrc.id)
		{
			objSrc = GetParent(objSrc);
		}
		
		if (m_objSelf.CallbackFunc)
		{
			m_objSelf.CallbackFunc(m_objSelf.AttachSrc);
		}
	};
	
	this.CallbackBtnTouchStart = function(objEvent)
	{
		var objSrc = GetEventSource(objEvent);
		
		if ("" == objSrc.id)
		{
			objSrc = GetParent(objSrc);
		}
		objEvent.preventDefault();
		objSrc.style.color = "#000";
		objSrc.style.backgroundImage = "URL(WebCommon/images/" + arrImageItems[1] +".png)";
	};
	
	this.CallbackBtnTouchEnd = function(objEvent)
	{
		var objSrc = GetEventSource(objEvent);
		
		if ("" == objSrc.id)
		{
			objSrc = GetParent(objSrc);
		}
		objSrc.style.color = "#333333";
		objSrc.style.backgroundImage  = "URL(WebCommon/images/" + arrImageItems[0] +".png)";
		
		if (m_objSelf.CallbackFunc)
		{
			m_objSelf.CallbackFunc(m_objSelf.AttachSrc);
		}
	};
	
	this.CallbackBtnTouchCancel = function(objEvent)
	{
		var objSrc = GetEventSource(objEvent);
		
		if ("" == objSrc.id)
		{
			objSrc = GetParent(objSrc);
		}
		objSrc.style.color = "#333333";
		objSrc.style.backgroundImage  = "URL(WebCommon/images/" + arrImageItems[0] +".png)";
	};
	
	this.SetDisabled = function(bDisabled)
	{
		if (bDisabled)
		{
			this.AttachSrc.style.opacity = 0.2;
			RemoveEvent(this.AttachSrc, "click", this.CallbackBtnClick);
			RemoveEvent(this.AttachSrc, "mouseout", this.CallbackBtnMouseOut);
			RemoveEvent(this.AttachSrc, "mousedown", this.CallbackBtnMouseDown);
			RemoveEvent(this.AttachSrc, "mouseup", this.CallbackBtnMouseUp);
			RemoveEvent(this.AttachSrc, "touchstart", this.CallbackBtnTouchStart);	
			RemoveEvent(this.AttachSrc, "touchend", this.CallbackBtnTouchEnd);	
			RemoveEvent(this.AttachSrc, "touchcancel", this.CallbackBtnTouchCancel);
			AddEvent(this.AttachSrc, "touchstart", this.CallbackTempTouchEvent);	
			AddEvent(this.AttachSrc, "touchend", this.CallbackTempTouchEvent);	
			AddEvent(this.AttachSrc, "touchcancel", this.CallbackTempTouchEvent);	
		}
		else
		{
			this.AttachSrc.style.opacity = 1;
			AddEvent(this.AttachSrc, "click", this.CallbackBtnClick);
			AddEvent(this.AttachSrc, "mouseout", this.CallbackBtnMouseOut);
			AddEvent(this.AttachSrc, "mousedown", this.CallbackBtnMouseDown);
			AddEvent(this.AttachSrc, "mouseup", this.CallbackBtnMouseUp);	
			AddEvent(this.AttachSrc, "touchstart", this.CallbackBtnTouchStart);	
			AddEvent(this.AttachSrc, "touchend", this.CallbackBtnTouchEnd);		
			AddEvent(this.AttachSrc, "touchcancel", this.CallbackBtnTouchCancel);
			RemoveEvent(this.AttachSrc, "touchstart", this.CallbackTempTouchEvent);	
			RemoveEvent(this.AttachSrc, "touchend", this.CallbackTempTouchEvent);	
			RemoveEvent(this.AttachSrc, "touchcancel", this.CallbackTempTouchEvent);	
		}
	}
	
	this.CallbackTempTouchEvent = function (objEvent)
	{
		objEvent.preventDefault();
	};
	
	this.Initialize();
}